// Pure WhatsApp helpers: phone numbers, webhook parsing and signatures, the 24-hour window. No imports beyond node:crypto.
import { createHmac, timingSafeEqual } from "node:crypto";

/** A WhatsApp id is the full number in digits. Ten-digit numbers are taken as Indian (+91). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^00/, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return /^\d{11,15}$/.test(full) ? full : null;
}

export const displayPhone = (waId: string) => (waId.startsWith("91") && waId.length === 12 ? `+91 ${waId.slice(2, 7)} ${waId.slice(7)}` : `+${waId}`);

/** Meta signs each webhook body: X-Hub-Signature-256: sha256=<hex HMAC-SHA256 with the app secret>. */
export function validSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  const given = header?.match(/^sha256=([0-9a-f]{64})$/i)?.[1];
  if (!given || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(given.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}

export type Inbound = { waId: string; name: string | null; id: string; at: string; type: string; body: string };
export type StatusUpdate = { id: string; status: string; error: string | null };

type WaMessage = {
  from: string; id: string; timestamp: string; type: string;
  text?: { body?: string }; image?: { caption?: string }; video?: { caption?: string }; document?: { caption?: string; filename?: string };
  audio?: unknown; sticker?: unknown; location?: { name?: string; address?: string; latitude?: number; longitude?: number };
  button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; reaction?: { emoji?: string };
  contacts?: { name?: { formatted_name?: string } }[];
};

/** What to show for a message of any type. Media is noted, not downloaded. */
export function describe(m: WaMessage): string {
  switch (m.type) {
    case "text": return m.text?.body ?? "";
    case "image": return `[photo]${m.image?.caption ? ` ${m.image.caption}` : ""}`;
    case "video": return `[video]${m.video?.caption ? ` ${m.video.caption}` : ""}`;
    case "document": return `[document] ${m.document?.filename ?? ""}${m.document?.caption ? ` ${m.document.caption}` : ""}`.trim();
    case "audio": return "[voice note]";
    case "sticker": return "[sticker]";
    case "location": return `[location] ${m.location?.name ?? ""} ${m.location?.address ?? ""}`.trim();
    case "button": return m.button?.text ?? "[button]";
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[reply]";
    case "reaction": return `[reaction] ${m.reaction?.emoji ?? ""}`.trim();
    case "contacts": return `[contact] ${m.contacts?.[0]?.name?.formatted_name ?? ""}`.trim();
    default: return `[${m.type}]`;
  }
}

/** Messages and delivery statuses for our phone number from one webhook call. Anything else is ignored. */
export function parseWebhook(payload: unknown, phoneNumberId: string): { messages: Inbound[]; statuses: StatusUpdate[] } {
  const messages: Inbound[] = [];
  const statuses: StatusUpdate[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (p?.object !== "whatsapp_business_account") return { messages, statuses };
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value as {
        metadata?: { phone_number_id?: string }; contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: WaMessage[]; statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
      } | undefined;
      if (change.field !== "messages" || !v || v.metadata?.phone_number_id !== phoneNumberId) continue;
      for (const m of v.messages ?? []) {
        if (!/^\d{6,15}$/.test(m.from ?? "") || !m.id) continue;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        const at = new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString();
        messages.push({ waId: m.from, name: name ? name.slice(0, 120) : null, id: m.id, at, type: m.type, body: describe(m).slice(0, 4096) });
      }
      for (const s of v.statuses ?? []) {
        if (!s.id || !s.status) continue;
        statuses.push({ id: s.id, status: s.status, error: s.errors?.[0] ? `${s.errors[0].title ?? ""} ${s.errors[0].message ?? ""}`.trim().slice(0, 300) : null });
      }
    }
  }
  return { messages, statuses };
}

/** Free-form replies are allowed for 24 hours after the customer last wrote; after that only templates. */
export function windowOpen(lastInbound: string | null, now = Date.now()): boolean {
  return Boolean(lastInbound) && now - Date.parse(lastInbound!) < 24 * 3_600_000;
}

/** Status only moves forward (sent → delivered → read), except to failed. */
export function nextStatus(current: string, incoming: string): string {
  const order = ["queued", "sent", "delivered", "read"];
  if (incoming === "failed") return "failed";
  return order.indexOf(incoming) > order.indexOf(current) ? incoming : current;
}
