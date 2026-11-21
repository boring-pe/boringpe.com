import { createHash } from "node:crypto";
import { getSql } from "./db";
import { randomToken, seal, unseal } from "./crypto-box";
import { credentials } from "./integrations";
import { ADAPTERS, type Conn, type MailProvider, type MessageFull, type MessageSummary, type Outgoing } from "./mail-providers";
import { canSeeFirmData, type Role } from "./rbac";
import { testMode } from "./test-mode";

export type MailAccount = {
  id: string; user_id: string; owner_email: string; provider: MailProvider; email: string; shared: boolean; status: string; last_error: string | null;
};
type Tokens = { access_token: string; refresh_token?: string; expires_at: number };

export const MAIL_PROVIDERS: { id: Exclude<MailProvider, "mock">; name: string }[] = [
  { id: "google", name: "Gmail / Google Workspace" },
  { id: "microsoft", name: "Outlook / Microsoft 365" },
  { id: "zoho", name: "Zoho Mail" },
];
export const mockEnabled = () => testMode();

/** Mailboxes this person may open: their own, plus ones shared with the team if they are on the team. */
export async function mailboxesFor(userId: string, role: Role) {
  const sql = await getSql();
  return sql.query<MailAccount>(
    `select a.id, a.user_id, u.email as owner_email, a.provider, a.email, a.shared, a.status, a.last_error
       from mail_accounts a join users u on u.id = a.user_id
      where a.user_id = $1 or (a.shared and $2::boolean) order by (a.user_id = $1) desc, a.email`,
    [userId, canSeeFirmData(role)],
  );
}

async function accountRow(id: string) {
  const sql = await getSql();
  return (await sql.query<MailAccount & { tokens: string; provider_account_id: string | null; inbox_folder_id: string | null; domain: string | null }>(
    `select a.id, a.user_id, u.email as owner_email, a.provider, a.email, a.shared, a.status, a.last_error, a.tokens,
            a.provider_account_id, a.inbox_folder_id, a.domain
       from mail_accounts a join users u on u.id = a.user_id where a.id = $1`,
    [id],
  ))[0] ?? null;
}

export const mayUse = (a: Pick<MailAccount, "user_id" | "shared">, userId: string, role: Role) =>
  a.user_id === userId || (a.shared && canSeeFirmData(role));

// ---- OAuth

const REDIRECT = (base: string, p: string) => `${base}/api/integrations/oauth/${p}/callback`;
const SCOPES: Record<string, string> = {
  google: "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events",
  microsoft: "offline_access openid email User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite",
  zoho: "ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ",
};
const zohoDc = (c: Record<string, string>) => (c.domain || "in").replace(/[^a-z.]/g, "") || "in";
function endpoints(provider: string, c: Record<string, string>) {
  if (provider === "google") return { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" };
  if (provider === "microsoft") {
    const tenant = encodeURIComponent(c.tenant || "common");
    return { auth: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` };
  }
  return { auth: `https://accounts.zoho.${zohoDc(c)}/oauth/v2/auth`, token: `https://accounts.zoho.${zohoDc(c)}/oauth/v2/token` };
}

/** Where to send the person to approve access, or null when the app is not set up in Integrations. */
export async function authorizeUrl(provider: "google" | "microsoft" | "zoho", userId: string, base: string) {
  const c = await credentials(provider);
  if (!c?.clientId || !c.clientSecret) return null;
  const state = randomToken(24);
  const verifier = provider === "zoho" ? null : randomToken(48);
  const sql = await getSql();
  await sql.query("delete from oauth_states where created_at < now() - interval '15 minutes'");
  await sql.query("insert into oauth_states (state, user_id, provider, verifier) values ($1, $2, $3, $4)", [state, userId, provider, verifier]);
  const params = new URLSearchParams({
    client_id: c.clientId, redirect_uri: REDIRECT(base, provider), response_type: "code", scope: SCOPES[provider], state,
    ...(verifier ? { code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" } : {}),
    ...(provider === "google" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : {}),
    ...(provider === "zoho" ? { access_type: "offline", prompt: "consent" } : {}),
  });
  return `${endpoints(provider, c).auth}?${params}`;
}

async function tokenRequest(provider: string, c: Record<string, string>, body: Record<string, string>): Promise<Tokens & { refresh_token?: string }> {
  const res = await fetch(endpoints(provider, c).token, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }), signal: AbortSignal.timeout(10000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error ?? `token ${res.status}`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

/** Finishes the OAuth round trip: checks the state belongs to this person, stores the mailbox. */
export async function completeOAuth(provider: string, code: string, state: string, userId: string, base: string): Promise<string> {
  const sql = await getSql();
  const st = (await sql.query<{ verifier: string | null }>(
    "delete from oauth_states where state = $1 and user_id = $2 and provider = $3 and created_at > now() - interval '15 minutes' returning verifier",
    [state, userId, provider],
  ))[0];
  if (!st) throw new Error("This connection link has expired or was not started by you. Try again.");
  const c = await credentials(provider);
  if (!c) throw new Error("This service is not set up in Integrations.");
  const tokens = await tokenRequest(provider, c, {
    grant_type: "authorization_code", code, redirect_uri: REDIRECT(base, provider), ...(st.verifier ? { code_verifier: st.verifier } : {}),
  });
  let email = "", providerAccountId: string | null = null, inbox: string | null = null;
  const auth = { Authorization: provider === "zoho" ? `Zoho-oauthtoken ${tokens.access_token}` : `Bearer ${tokens.access_token}` };
  if (provider === "google") {
    email = ((await (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: auth })).json()) as { emailAddress: string }).emailAddress;
  } else if (provider === "microsoft") {
    const me = (await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: auth })).json()) as { mail?: string; userPrincipalName?: string };
    email = me.mail ?? me.userPrincipalName ?? "";
  } else {
    const base = `https://mail.zoho.${zohoDc(c)}/api/accounts`;
    const acc = ((await (await fetch(base, { headers: auth })).json()) as { data: { accountId: string; primaryEmailAddress?: string; mailboxAddress?: string }[] }).data[0];
    providerAccountId = acc.accountId;
    email = acc.primaryEmailAddress ?? acc.mailboxAddress ?? "";
    const folders = ((await (await fetch(`${base}/${acc.accountId}/folders`, { headers: auth })).json()) as { data: { folderId: string; folderType?: string; folderName?: string }[] }).data;
    inbox = (folders.find((f) => f.folderType === "Inbox") ?? folders.find((f) => f.folderName === "Inbox"))?.folderId ?? null;
  }
  if (!email) throw new Error("Could not read the mailbox address.");
  await sql.query(
    `insert into mail_accounts (user_id, provider, email, tokens, provider_account_id, inbox_folder_id, domain)
     values ($1, $2, lower($3), $4, $5, $6, $7)
     on conflict (user_id, provider, email) do update set tokens = excluded.tokens, provider_account_id = excluded.provider_account_id,
       inbox_folder_id = excluded.inbox_folder_id, domain = excluded.domain, status = 'active', last_error = null`,
    [userId, provider, email, seal(tokens), providerAccountId, inbox, provider === "zoho" ? zohoDc(c) : null],
  );
  return email;
}

/** A valid access token, refreshed when it is about to expire. */
async function connection(id: string): Promise<{ provider: MailProvider; conn: Conn }> {
  const a = await accountRow(id);
  if (!a) throw new Error("Mailbox not found.");
  const conn: Conn = { token: "", email: a.email, providerAccountId: a.provider_account_id, inboxFolderId: a.inbox_folder_id, domain: a.domain };
  if (a.provider === "mock") return { provider: "mock", conn };
  let t = unseal<Tokens>(a.tokens);
  if (!t) throw new Error("Stored tokens are unreadable. Connect this mailbox again.");
  if (t.expires_at - Date.now() < 60_000) {
    if (!t.refresh_token) throw new Error("Access expired. Connect this mailbox again.");
    const c = await credentials(a.provider);
    if (!c) throw new Error("This service is not set up in Integrations.");
    const fresh = await tokenRequest(a.provider, c, { grant_type: "refresh_token", refresh_token: t.refresh_token, ...(a.provider === "microsoft" ? { scope: SCOPES.microsoft } : {}) });
    t = { ...fresh, refresh_token: fresh.refresh_token ?? t.refresh_token };
    const sql = await getSql();
    await sql.query("update mail_accounts set tokens = $2, status = 'active', last_error = null where id = $1", [id, seal(t)]);
  }
  return { provider: a.provider, conn: { ...conn, token: t.access_token } };
}

async function noteError(id: string, err: unknown) {
  const sql = await getSql();
  await sql.query("update mail_accounts set status = 'error', last_error = $2 where id = $1", [id, String((err as Error).message).slice(0, 300)]);
}

// ---- test-only mailbox, enabled by PORTAL_TEST_MODE=1

type MockStore = Map<string, MessageFull[]>;
const g = globalThis as typeof globalThis & { __mockMail?: MockStore };
const mock = (): MockStore => (g.__mockMail ??= new Map());
const mockBox = (email: string): MessageFull[] => mock().get(email) ?? [];
function mockSeed(email: string): MessageFull[] {
  const now = Date.now();
  return [
    { id: "mock-1", threadId: "t1", from: "Asha Patil <asha@acme.example>", to: email, cc: "", subject: "Term sheet draft", snippet: "Please find the draft attached",
      date: new Date(now - 3_600_000).toISOString(), unread: true, html: "<p>Please find the <b>draft</b> attached.</p><script>window.pwned=1</script>", text: "Please find the draft attached.", messageIdHeader: "<m1@acme>", references: null },
    { id: "mock-2", threadId: "t2", from: "Bank <alerts@bank.example>", to: email, cc: "", subject: "Statement ready", snippet: "Your November statement",
      date: new Date(now - 7_200_000).toISOString(), unread: false, html: null, text: "Your November statement is ready.", messageIdHeader: null, references: null },
  ];
}

export async function connectMock(userId: string, email: string) {
  if (!mockEnabled()) return false;
  const sql = await getSql();
  await sql.query(
    "insert into mail_accounts (user_id, provider, email, tokens) values ($1, 'mock', lower($2), $3) on conflict (user_id, provider, email) do nothing",
    [userId, email, seal({ access_token: "mock", expires_at: 0 })],
  );
  if (!mock().has(email.toLowerCase())) mock().set(email.toLowerCase(), mockSeed(email.toLowerCase()));
  return true;
}

// ---- the inbox

export type InboxItem = MessageSummary & { accountId: string; accountEmail: string; provider: MailProvider };

/** Latest messages across the chosen mailboxes, newest first. One failing mailbox does not hide the others. */
export async function unifiedInbox(accounts: MailAccount[], q?: string) {
  const errors: { email: string; message: string }[] = [];
  const lists = await Promise.all(accounts.map(async (a) => {
    try {
      if (a.provider === "mock") {
        const all = mockBox(a.email);
        const term = q?.toLowerCase();
        return all.filter((m) => !term || `${m.subject} ${m.from} ${m.text}`.toLowerCase().includes(term))
          .map((m) => ({ ...m, accountId: a.id, accountEmail: a.email, provider: a.provider }));
      }
      const { provider, conn } = await connection(a.id);
      const items = await ADAPTERS[provider as "google" | "microsoft" | "zoho"].list(fetch, conn, q);
      return items.map((m) => ({ ...m, accountId: a.id, accountEmail: a.email, provider: a.provider }));
    } catch (err) {
      errors.push({ email: a.email, message: (err as Error).message });
      await noteError(a.id, err);
      return [];
    }
  }));
  return { items: lists.flat().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 100), errors };
}

export async function readMessage(accountId: string, messageId: string): Promise<MessageFull> {
  const a = await accountRow(accountId);
  if (a?.provider === "mock") {
    const m = mockBox(a.email).find((x) => x.id === messageId);
    if (!m) throw new Error("Message not found.");
    m.unread = false;
    return m;
  }
  const { provider, conn } = await connection(accountId);
  return ADAPTERS[provider as "google" | "microsoft" | "zoho"].get(fetch, conn, messageId);
}

export async function sendMail(accountId: string, m: Outgoing) {
  const a = await accountRow(accountId);
  if (a?.provider === "mock") {
    const box = mockBox(a.email);
    box.unshift({
      id: `mock-sent-${box.length + 1}`, threadId: m.replyTo?.threadId ?? null, from: a.email, to: m.to, cc: m.cc ?? "", subject: m.subject,
      snippet: m.body.slice(0, 120), date: new Date().toISOString(), unread: false, html: null, text: m.body, messageIdHeader: null, references: null,
    });
    mock().set(a.email, box);
    return;
  }
  const { provider, conn } = await connection(accountId);
  await ADAPTERS[provider as "google" | "microsoft" | "zoho"].send(fetch, conn, m);
}

export { accountRow };

export async function setShared(id: string, ownerId: string, shared: boolean) {
  const sql = await getSql();
  return (await sql.query("update mail_accounts set shared = $3 where id = $1 and user_id = $2 returning id", [id, ownerId, shared])).length > 0;
}

export async function removeMailbox(id: string, ownerId: string) {
  const sql = await getSql();
  return (await sql.query("delete from mail_accounts where id = $1 and user_id = $2 returning id", [id, ownerId])).length > 0;
}
