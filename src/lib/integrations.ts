import { createHmac } from "node:crypto";
import { getSql } from "./db";
import { randomToken, seal, sha256, unseal } from "./crypto-box";
import { providerById, safeWebhookUrl, type ApiScope, type WebhookEvent } from "./integration-catalog";

export type IntegrationState = {
  provider: string; status: "connected" | "disconnected" | "error"; config: Record<string, string>;
  secretKeys: string[]; last_checked_at: string | null; last_error: string | null; updated_at: string;
};

export async function listIntegrations(): Promise<IntegrationState[]> {
  const sql = await getSql();
  const rows = await sql.query<{ provider: string; status: IntegrationState["status"]; config: Record<string, string>; secrets: string | null; last_checked_at: string | null; last_error: string | null; updated_at: string }>(
    "select provider, status, config, secrets, last_checked_at::text, last_error, updated_at::text from integrations",
  );
  // Only which secrets are set is ever returned, never their values.
  return rows.map((r) => ({ ...r, secretKeys: Object.keys(unseal(r.secrets) ?? {}), secrets: undefined }) as IntegrationState);
}

/** Config and decrypted secrets of a connected service, for server-side use only. */
export async function credentials(provider: string): Promise<Record<string, string> | null> {
  const sql = await getSql();
  const row = (await sql.query<{ config: Record<string, string>; secrets: string | null; status: string }>(
    "select config, secrets, status from integrations where provider = $1",
    [provider],
  ))[0];
  if (!row || row.status === "disconnected") return null;
  return { ...row.config, ...(unseal(row.secrets) ?? {}) };
}

export async function logEvent(provider: string, action: string, ok: boolean, message: string, actorEmail: string | null) {
  const sql = await getSql();
  await sql.query("insert into integration_log (provider, action, ok, message, actor_email) values ($1,$2,$3,$4,$5)", [
    provider, action, ok, message.slice(0, 500), actorEmail,
  ]);
}

export async function recentLog(limit = 50) {
  const sql = await getSql();
  return sql.query<{ id: string; provider: string; action: string; ok: boolean; message: string; actor_email: string | null; created_at: string }>(
    "select id::text, provider, action, ok, message, actor_email, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at from integration_log order by created_at desc limit $1",
    [limit],
  );
}

/**
 * Saves a service's settings. A secret field left blank keeps what is stored, so secrets never
 * have to be shown again. Returns the names of required fields still missing.
 */
export async function saveIntegration(provider: string, values: Record<string, string>, by: string): Promise<string[]> {
  const p = providerById(provider);
  if (!p) return ["provider"];
  const sql = await getSql();
  const existing = (await sql.query<{ config: Record<string, string>; secrets: string | null }>(
    "select config, secrets from integrations where provider = $1",
    [provider],
  ))[0];
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = { ...(unseal(existing?.secrets ?? null) ?? {}) };
  for (const f of p.fields) {
    const v = (values[f.key] ?? "").trim().slice(0, 4000);
    if (f.secret) {
      if (v) secrets[f.key] = v;
    } else config[f.key] = v;
  }
  const missing = p.fields.filter((f) => f.required && !(f.secret ? secrets[f.key] : config[f.key])).map((f) => f.label);
  await sql.query(
    `insert into integrations (provider, config, secrets, status, updated_by, updated_at, last_error)
     values ($1, $2::jsonb, $3, $4, $5, now(), null)
     on conflict (provider) do update set config = excluded.config, secrets = excluded.secrets, status = excluded.status,
       updated_by = excluded.updated_by, updated_at = now(), last_error = null`,
    [provider, JSON.stringify(config), seal(secrets), missing.length ? "error" : "connected", by],
  );
  return missing;
}

export async function disconnect(provider: string, by: string) {
  const sql = await getSql();
  await sql.query("update integrations set status = 'disconnected', secrets = null, updated_by = $2, updated_at = now() where provider = $1", [provider, by]);
}

async function probe(url: string, init: RequestInit): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (res.ok) return { ok: true, message: `OK (${res.status})` };
    const text = (await res.text()).slice(0, 200);
    return { ok: false, message: `${res.status}: ${text}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Checks the stored credentials against the service itself, where the service allows it. */
export async function testIntegration(provider: string): Promise<{ ok: boolean; message: string }> {
  const c = await credentials(provider);
  if (!c) return { ok: false, message: "Not connected." };
  let result: { ok: boolean; message: string };
  switch (provider) {
    case "resend":
      result = await probe("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${c.apiKey}` } });
      break;
    case "razorpay":
      result = await probe("https://api.razorpay.com/v1/payments?count=1", {
        headers: { Authorization: `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64")}` },
      });
      break;
    case "whatsapp":
      result = await probe(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(c.phoneNumberId)}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${c.accessToken}` },
      });
      break;
    case "ai_anthropic":
    case "ai_openai":
    case "ai_gemini":
    case "ai_custom":
      result = await (await import("./ai")).pingProvider(provider);
      break;
    default:
      // OAuth apps are proven by connecting a mailbox with them.
      result = c.clientId && c.clientSecret
        ? { ok: true, message: "Saved. Connect a mailbox to confirm the app works." }
        : { ok: false, message: "Client ID and secret are both needed." };
  }
  const sql = await getSql();
  await sql.query("update integrations set status = $2, last_checked_at = now(), last_error = $3 where provider = $1", [
    provider, result.ok ? "connected" : "error", result.ok ? null : result.message,
  ]);
  return result;
}

export const WHATSAPP_API_VERSION = "v26.0";

// ---- API keys

export async function createApiKey(name: string, scopes: ApiScope[], by: string) {
  const secret = `bpe_${randomToken(30)}`;
  const sql = await getSql();
  await sql.query("insert into api_keys (name, prefix, key_hash, scopes, created_by) values ($1, $2, $3, $4, $5)", [
    name, secret.slice(0, 10), sha256(secret), scopes, by,
  ]);
  return secret;
}

export async function listApiKeys() {
  const sql = await getSql();
  return sql.query<{ id: string; name: string; prefix: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string; creator: string }>(
    `select k.id, k.name, k.prefix, k.scopes, to_char(k.last_used_at, 'YYYY-MM-DD HH24:MI') as last_used_at, k.revoked_at::text,
            to_char(k.created_at, 'YYYY-MM-DD') as created_at, u.email as creator
       from api_keys k join users u on u.id = k.created_by order by k.created_at desc`,
  );
}

export async function revokeApiKey(id: string) {
  const sql = await getSql();
  return (await sql.query("update api_keys set revoked_at = now() where id = $1 and revoked_at is null returning id", [id])).length > 0;
}

/** The key behind an Authorization: Bearer header, if it is live and its creator is still active. */
export async function verifyApiKey(header: string | null) {
  const token = header?.match(/^Bearer\s+(bpe_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return null;
  const sql = await getSql();
  const row = (await sql.query<{ id: string; name: string; scopes: string[]; created_by: string; email: string; role: string }>(
    `update api_keys k set last_used_at = now() from users u
      where k.key_hash = $1 and k.revoked_at is null and u.id = k.created_by and u.status = 'active'
      returning k.id, k.name, k.scopes, k.created_by, u.email, u.role`,
    [sha256(token)],
  ))[0];
  return row ?? null;
}

// ---- outgoing webhooks

export async function addWebhook(url: string, events: WebhookEvent[], by: string) {
  if (!safeWebhookUrl(url)) return null;
  const secret = `whsec_${randomToken(24)}`;
  const sql = await getSql();
  await sql.query("insert into webhook_endpoints (url, secret, events, created_by) values ($1, $2, $3, $4)", [url, seal({ secret }), events, by]);
  return secret;
}

export async function listWebhooks() {
  const sql = await getSql();
  return sql.query<{ id: string; url: string; events: string[]; active: boolean; last_status: number | null; last_ok: boolean | null; last_at: string | null }>(
    `select w.id, w.url, w.events, w.active,
            d.status_code as last_status, d.ok as last_ok, to_char(d.created_at, 'YYYY-MM-DD HH24:MI') as last_at
       from webhook_endpoints w
       left join lateral (select status_code, ok, created_at from webhook_deliveries where endpoint_id = w.id order by created_at desc limit 1) d on true
      order by w.created_at desc`,
  );
}

export async function removeWebhook(id: string) {
  const sql = await getSql();
  return (await sql.query("delete from webhook_endpoints where id = $1 returning id", [id])).length > 0;
}

/** Signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body" with the endpoint secret>. */
export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

async function deliver(endpoint: { id: string; url: string; secret: string }, event: string, payload: unknown, attempts = 1) {
  const secret = unseal<{ secret: string }>(endpoint.secret)?.secret ?? "";
  const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
  let status: number | null = null, ok = false, error: string | null = null;
  if (!safeWebhookUrl(endpoint.url)) error = "unsafe url";
  else {
    try {
      const res = await fetch(endpoint.url, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json", "User-Agent": "BoringPortal-Webhooks/1", "X-BoringPE-Event": event, "X-BoringPE-Signature": signWebhook(secret, body) },
        body,
      });
      status = res.status;
      ok = res.ok;
    } catch (err) {
      error = (err as Error).message.slice(0, 200);
    }
  }
  const sql = await getSql();
  await sql.query("insert into webhook_deliveries (endpoint_id, event, payload, status_code, ok, error, attempts) values ($1,$2,$3::jsonb,$4,$5,$6,$7)", [
    endpoint.id, event, JSON.stringify(payload), status, ok, error, attempts,
  ]);
  return ok;
}

/** Sends an event to every active endpoint subscribed to it. Never throws. */
export async function emit(event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    const sql = await getSql();
    const endpoints = await sql.query<{ id: string; url: string; secret: string }>(
      "select id, url, secret from webhook_endpoints where active and $1 = any(events)",
      [event],
    );
    await Promise.all(endpoints.map((e) => deliver(e, event, payload)));
  } catch (err) {
    console.error("[webhooks]", (err as Error).message);
  }
}

/** Sends a test event to one endpoint now. */
export async function pingWebhook(id: string) {
  const sql = await getSql();
  const e = (await sql.query<{ id: string; url: string; secret: string }>("select id, url, secret from webhook_endpoints where id = $1", [id]))[0];
  return e ? deliver(e, "ping", { message: "Test event from the Boring Portal" }) : false;
}
