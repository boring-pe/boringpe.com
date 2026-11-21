import { getSql } from "./db";
import { credentials } from "./integrations";

export type NotificationRow = { id: string; kind: string; title: string; body: string; href: string; read_at: string | null; created_at: string };

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const internal = (href: string) => (href.startsWith("/portal") && !href.startsWith("//") ? href : "/portal/notifications");

/** Sends one email through Resend when it is configured. Never throws: a notification must not break the action. */
async function sendEmail(to: string, subject: string, text: string, href: string) {
  // The integrations hub wins; the environment variables used for sign-in email are the fallback.
  const hub = await credentials("resend").catch(() => null);
  const key = hub?.apiKey || process.env.AUTH_RESEND_KEY;
  const from = hub?.from || process.env.AUTH_EMAIL_FROM;
  if (!key || !from) return false;
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const link = base ? `${base}${href}` : "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to, subject: `Boring Portal: ${subject}`,
        text: `${text}\n\n${link}`,
        html: `<p>${escape(text)}</p>${link ? `<p><a href="${escape(link)}">Open in the portal</a></p>` : ""}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type Notice = { kind: string; title: string; body?: string; href?: string };

/** Notifies these users in the portal, and by email for those who keep email on. */
export async function notifyUsers(userIds: (string | null | undefined)[], n: Notice) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return;
  try {
    const sql = await getSql();
    const href = internal(n.href ?? "/portal/notifications");
    const rows = await sql.query<{ id: string; email: string; notify_email: boolean }>(
      `insert into notifications (user_id, kind, title, body, href)
       select u.id, $2, $3, $4, $5 from users u where u.id = any($1::text[]) and u.status = 'active'
       returning id, (select email from users where id = user_id) as email, (select notify_email from users where id = user_id) as notify_email`,
      [ids, n.kind, n.title.slice(0, 200), (n.body ?? "").slice(0, 1000), href],
    );
    for (const r of rows) {
      if (r.notify_email && (await sendEmail(r.email, n.title, n.body ?? n.title, href))) {
        await sql.query("update notifications set emailed_at = now() where id = $1", [r.id]);
      }
    }
  } catch (err) {
    console.error("[notify]", (err as Error).message);
  }
}

/** Notifies everyone active in these roles, except one person (usually whoever caused it). */
export async function notifyRoles(roles: string[], n: Notice, except?: string | null) {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      "select id from users where status = 'active' and role = any($1::text[]) and id is distinct from $2",
      [roles, except ?? null],
    );
    await notifyUsers(rows.map((r) => r.id), n);
  } catch (err) {
    console.error("[notify]", (err as Error).message);
  }
}

export async function userIdByEmail(email: string | null | undefined) {
  if (!email) return null;
  const sql = await getSql();
  return (await sql.query<{ id: string }>("select id from users where lower(email) = lower($1)", [email]))[0]?.id ?? null;
}

export async function listNotifications(userId: string) {
  const sql = await getSql();
  return sql.query<NotificationRow>(
    `select id, kind, title, body, href, read_at::text, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from notifications where user_id = $1 order by created_at desc limit 100`,
    [userId],
  );
}

export async function unreadCount(userId: string) {
  const sql = await getSql();
  return (await sql.query<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [userId]))[0].n;
}

/** Marks one as read and returns where it points; only the owner's own notifications. */
export async function openNotification(id: string, userId: string) {
  const sql = await getSql();
  const row = (await sql.query<{ href: string }>(
    "update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning href",
    [id, userId],
  ))[0];
  return row ? internal(row.href) : null;
}

export async function markAllRead(userId: string) {
  const sql = await getSql();
  await sql.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [userId]);
}

export async function setEmailPreference(userId: string, on: boolean) {
  const sql = await getSql();
  await sql.query("update users set notify_email = $2 where id = $1", [userId, on]);
}

export async function emailPreference(userId: string) {
  const sql = await getSql();
  return (await sql.query<{ notify_email: boolean }>("select notify_email from users where id = $1", [userId]))[0]?.notify_email ?? true;
}

export async function emailConfigured() {
  const hub = await credentials("resend").catch(() => null);
  return Boolean((hub?.apiKey && hub?.from) || (process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM));
}
