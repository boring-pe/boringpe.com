import { randomUUID } from "node:crypto";
import { getSql } from "./db";
import { credentials, emit, WHATSAPP_API_VERSION } from "./integrations";
import { notifyRoles, notifyUsers } from "./notify";
import { testMode } from "./test-mode";
import { nextStatus, parseWebhook, validSignature, windowOpen } from "./whatsapp-calc";

export type Conversation = {
  wa_id: string; name: string | null; assigned_to: string | null; assignee_email: string | null; last_message_at: string;
  last_inbound_at: string | null; unread: number; preview: string | null;
};
export type WaMessage = { id: string; direction: "in" | "out"; body: string; template_name: string | null; status: string; error: string | null; sender: string | null; created_at: string };

export async function conversations(filter: { mine?: string; q?: string } = {}) {
  const sql = await getSql();
  return sql.query<Conversation>(
    `select c.wa_id, c.name, c.assigned_to, u.email as assignee_email, c.last_message_at::text, c.last_inbound_at::text, c.unread,
            (select body from wa_messages m where m.wa_id = c.wa_id order by m.created_at desc limit 1) as preview
       from wa_contacts c left join users u on u.id = c.assigned_to
      where ($1::text is null or c.assigned_to = $1) and ($2::text is null or c.wa_id like '%' || $2 || '%' or c.name ilike '%' || $2 || '%')
      order by c.last_message_at desc limit 200`,
    [filter.mine ?? null, filter.q ?? null],
  );
}

export async function thread(waId: string) {
  const sql = await getSql();
  await sql.query("update wa_contacts set unread = 0 where wa_id = $1", [waId]);
  const contact = (await sql.query<Conversation>(
    `select c.wa_id, c.name, c.assigned_to, u.email as assignee_email, c.last_message_at::text, c.last_inbound_at::text, c.unread, null as preview
       from wa_contacts c left join users u on u.id = c.assigned_to where c.wa_id = $1`,
    [waId],
  ))[0] ?? null;
  const messages = await sql.query<WaMessage>(
    `select m.id, m.direction, m.body, m.template_name, m.status, m.error, u.email as sender, to_char(m.created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from wa_messages m left join users u on u.id = m.sent_by where m.wa_id = $1 order by m.created_at limit 500`,
    [waId],
  );
  return { contact, messages, canReply: windowOpen(contact?.last_inbound_at ?? null) };
}

export async function unreadTotal() {
  const sql = await getSql();
  return (await sql.query<{ n: number }>("select coalesce(sum(unread), 0)::int as n from wa_contacts"))[0].n;
}

/** Handles one webhook call after its signature is checked. Duplicate deliveries change nothing. */
export async function receive(rawBody: string, signature: string | null): Promise<"ok" | "unauthorized" | "not-configured"> {
  const c = await credentials("whatsapp");
  if (!c?.appSecret || !c.phoneNumberId) return "not-configured";
  if (!validSignature(rawBody, signature, c.appSecret)) return "unauthorized";
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return "ok";
  }
  const { messages, statuses } = parseWebhook(payload, c.phoneNumberId);
  const sql = await getSql();
  for (const m of messages) {
    const fresh = await sql.tx(async (db) => {
      await db.query(
        `insert into wa_contacts (wa_id, name, last_message_at, last_inbound_at) values ($1, $2, $3::timestamptz, $3::timestamptz)
         on conflict (wa_id) do update set name = coalesce(excluded.name, wa_contacts.name),
           last_message_at = greatest(wa_contacts.last_message_at, excluded.last_message_at),
           last_inbound_at = greatest(coalesce(wa_contacts.last_inbound_at, excluded.last_inbound_at), excluded.last_inbound_at)`,
        [m.waId, m.name, m.at],
      );
      const added = await db.query(
        "insert into wa_messages (id, wa_id, direction, type, body, status, created_at) values ($1, $2, 'in', $3, $4, 'received', $5::timestamptz) on conflict (id) do nothing returning id",
        [m.id, m.waId, m.type, m.body, m.at],
      );
      if (added.length) await db.query("update wa_contacts set unread = unread + 1 where wa_id = $1", [m.waId]);
      return added.length > 0;
    });
    if (!fresh) continue;
    const owner = (await sql.query<{ assigned_to: string | null }>("select assigned_to from wa_contacts where wa_id = $1", [m.waId]))[0]?.assigned_to;
    const notice = { kind: "whatsapp", title: `WhatsApp from ${m.name ?? `+${m.waId}`}`, body: m.body.slice(0, 200), href: `/portal/whatsapp?c=${m.waId}` };
    if (owner) await notifyUsers([owner], notice);
    else await notifyRoles(["super_admin", "admin"], notice);
    await emit("whatsapp.message", { wa_id: m.waId, name: m.name, body: m.body, type: m.type, at: m.at });
  }
  for (const s of statuses) {
    const cur = (await sql.query<{ status: string }>("select status from wa_messages where id = $1 and direction = 'out'", [s.id]))[0];
    if (!cur) continue;
    await sql.query("update wa_messages set status = $2, error = coalesce($3, error) where id = $1", [s.id, nextStatus(cur.status, s.status), s.error]);
  }
  return "ok";
}

export async function verifyChallenge(mode: string | null, token: string | null) {
  const c = await credentials("whatsapp");
  return mode === "subscribe" && Boolean(c?.verifyToken) && token === c?.verifyToken;
}

async function graphSend(body: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  if (testMode()) return { id: `wamid.test.${randomUUID()}` };
  const c = await credentials("whatsapp");
  if (!c?.accessToken || !c.phoneNumberId) return { error: "WhatsApp is not connected under Integrations." };
  try {
    const res = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(c.phoneNumberId)}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }), signal: AbortSignal.timeout(10000),
    });
    const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok || !j.messages?.[0]?.id) return { error: j.error?.message ?? `WhatsApp said ${res.status}` };
    return { id: j.messages[0].id };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function record(waId: string, r: { id: string } | { error: string }, body: string, by: string, template: string | null) {
  const sql = await getSql();
  await sql.query(
    `insert into wa_contacts (wa_id) values ($1) on conflict (wa_id) do update set last_message_at = now()`,
    [waId],
  );
  await sql.query(
    "insert into wa_messages (id, wa_id, direction, type, body, template_name, status, error, sent_by) values ($1, $2, 'out', $3, $4, $5, $6, $7, $8)",
    ["id" in r ? r.id : `local.${randomUUID()}`, waId, template ? "template" : "text", body, template, "id" in r ? "sent" : "failed", "error" in r ? r.error : null, by],
  );
  return "id" in r ? null : r.error;
}

/** A free-form reply; only inside the 24-hour window. Returns an error message or null. */
export async function sendText(waId: string, text: string, by: string): Promise<string | null> {
  const t = await thread(waId);
  if (!t.contact) return "No such conversation.";
  if (!t.canReply) return "More than 24 hours since they last wrote: send an approved template instead.";
  return record(waId, await graphSend({ to: waId, type: "text", text: { preview_url: false, body: text } }), text, by, null);
}

/** An approved template, which may start a conversation or reopen one after 24 hours. */
export async function sendTemplate(waId: string, name: string, language: string, params: string[], by: string): Promise<string | null> {
  const body = {
    to: waId, type: "template",
    template: { name, language: { code: language }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}) },
  };
  return record(waId, await graphSend(body), `[template ${name}]${params.length ? ` ${params.join(" · ")}` : ""}`, by, name);
}

export async function assign(waId: string, userId: string | null) {
  const sql = await getSql();
  return (await sql.query("update wa_contacts set assigned_to = $2 where wa_id = $1 returning wa_id", [waId, userId])).length > 0;
}

export async function rename(waId: string, name: string) {
  const sql = await getSql();
  await sql.query("update wa_contacts set name = $2 where wa_id = $1", [waId, name || null]);
}

/** Approved templates from Meta, for the template picker. */
export async function templates(): Promise<{ name: string; language: string; body: string; params: number }[]> {
  if (testMode()) return [{ name: "hello_world", language: "en_US", body: "Hello World", params: 0 }, { name: "follow_up", language: "en", body: "Hi {{1}}, following up on {{2}}.", params: 2 }];
  const c = await credentials("whatsapp");
  if (!c?.accessToken || !c.businessAccountId) return [];
  try {
    const res = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(c.businessAccountId)}/message_templates?fields=name,language,status,components&limit=100`, {
      headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as { data?: { name: string; language: string; status: string; components?: { type: string; text?: string }[] }[] };
    return (j.data ?? []).filter((t) => t.status === "APPROVED").map((t) => {
      const body = t.components?.find((x) => x.type === "BODY")?.text ?? "";
      return { name: t.name, language: t.language, body, params: (body.match(/\{\{\d+\}\}/g) ?? []).length };
    });
  } catch {
    return [];
  }
}
