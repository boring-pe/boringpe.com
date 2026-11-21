// Mail provider adapters: Gmail API, Microsoft Graph and Zoho Mail, normalised to one shape.
// No imports: `fetch` is passed in, so tests run them against fake responses.

export type MailProvider = "google" | "microsoft" | "zoho" | "mock";
export type Fetch = typeof fetch;
export type Conn = { token: string; providerAccountId?: string | null; inboxFolderId?: string | null; domain?: string | null; email: string };

export type MessageSummary = {
  id: string; threadId: string | null; from: string; to: string; subject: string; snippet: string; date: string; unread: boolean;
};
export type MessageFull = MessageSummary & { cc: string; html: string | null; text: string; messageIdHeader: string | null; references: string | null };
export type Outgoing = { to: string; cc?: string; subject: string; body: string; replyTo?: MessageFull | null };

class ProviderError extends Error {}

async function call(f: Fetch, url: string, init: RequestInit & { token: string; scheme?: string }) {
  const { token, scheme = "Bearer", ...rest } = init;
  const res = await f(url, {
    ...rest,
    headers: { Authorization: `${scheme} ${token}`, ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new ProviderError(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 202 || res.status === 204 ? null : res.json();
}

/** No newlines in header values: blocks header injection into raw MIME. */
export const headerSafe = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** RFC 2822 message for Gmail, UTF-8 plain text, with threading headers on replies. */
export function buildMime(from: string, m: Outgoing): string {
  const subject = headerSafe(m.subject);
  const lines = [
    `From: ${headerSafe(from)}`,
    `To: ${headerSafe(m.to)}`,
    ...(m.cc ? [`Cc: ${headerSafe(m.cc)}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...(m.replyTo?.messageIdHeader ? [`In-Reply-To: ${headerSafe(m.replyTo.messageIdHeader)}`, `References: ${headerSafe([m.replyTo.references, m.replyTo.messageIdHeader].filter(Boolean).join(" "))}`] : []),
    "",
    Buffer.from(m.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return lines.join("\r\n");
}

// ---- Gmail

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };
const gmailHeader = (p: GmailPart | undefined, name: string) => p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
function gmailBody(p: GmailPart, type: string): string | null {
  if (p.mimeType === type && p.body?.data) return fromB64url(p.body.data);
  for (const c of p.parts ?? []) {
    const found = gmailBody(c, type);
    if (found) return found;
  }
  return null;
}

const gmail = {
  async list(f: Fetch, c: Conn, q?: string): Promise<MessageSummary[]> {
    const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
    const params = new URLSearchParams({ maxResults: "20", ...(q ? { q } : { labelIds: "INBOX" }) });
    const ids = ((await call(f, `${base}?${params}`, { token: c.token })) as { messages?: { id: string }[] }).messages ?? [];
    return Promise.all(ids.map(async ({ id }) => {
      const m = (await call(f, `${base}/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, { token: c.token })) as {
        id: string; threadId: string; snippet: string; labelIds?: string[]; internalDate: string; payload: GmailPart;
      };
      return {
        id: m.id, threadId: m.threadId, from: gmailHeader(m.payload, "From"), to: gmailHeader(m.payload, "To"), subject: gmailHeader(m.payload, "Subject"),
        snippet: m.snippet, date: new Date(Number(m.internalDate)).toISOString(), unread: (m.labelIds ?? []).includes("UNREAD"),
      };
    }));
  },
  async get(f: Fetch, c: Conn, id: string): Promise<MessageFull> {
    const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
    const m = (await call(f, `${base}/${encodeURIComponent(id)}?format=full`, { token: c.token })) as {
      id: string; threadId: string; snippet: string; labelIds?: string[]; internalDate: string; payload: GmailPart;
    };
    if ((m.labelIds ?? []).includes("UNREAD")) {
      await call(f, `${base}/${encodeURIComponent(id)}/modify`, { token: c.token, method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) }).catch(() => null);
    }
    return {
      id: m.id, threadId: m.threadId, from: gmailHeader(m.payload, "From"), to: gmailHeader(m.payload, "To"), cc: gmailHeader(m.payload, "Cc"),
      subject: gmailHeader(m.payload, "Subject"), snippet: m.snippet, date: new Date(Number(m.internalDate)).toISOString(), unread: false,
      html: gmailBody(m.payload, "text/html"), text: gmailBody(m.payload, "text/plain") ?? m.snippet,
      messageIdHeader: gmailHeader(m.payload, "Message-ID") || null, references: gmailHeader(m.payload, "References") || null,
    };
  },
  async send(f: Fetch, c: Conn, m: Outgoing) {
    await call(f, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      token: c.token, method: "POST", body: JSON.stringify({ raw: b64url(buildMime(c.email, m)), ...(m.replyTo?.threadId ? { threadId: m.replyTo.threadId } : {}) }),
    });
  },
};

// ---- Microsoft Graph

type GraphAddr = { emailAddress?: { name?: string; address?: string } };
const graphAddr = (a?: GraphAddr) => (a?.emailAddress ? (a.emailAddress.name ? `${a.emailAddress.name} <${a.emailAddress.address}>` : a.emailAddress.address ?? "") : "");
const graphList = (as?: GraphAddr[]) => (as ?? []).map(graphAddr).join(", ");
const toGraph = (list: string) => list.split(",").map((s) => s.trim()).filter(Boolean).map((address) => ({ emailAddress: { address } }));

const microsoft = {
  async list(f: Fetch, c: Conn, q?: string): Promise<MessageSummary[]> {
    const select = "$select=id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead";
    const url = q
      ? `https://graph.microsoft.com/v1.0/me/messages?$top=20&${select}&$search=${encodeURIComponent(`"${q.replace(/"/g, "")}"`)}`
      : `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&${select}&$orderby=receivedDateTime%20desc`;
    const r = (await call(f, url, { token: c.token })) as { value: { id: string; conversationId: string; subject: string; bodyPreview: string; from?: GraphAddr; toRecipients?: GraphAddr[]; receivedDateTime: string; isRead: boolean }[] };
    return r.value.map((m) => ({
      id: m.id, threadId: m.conversationId, from: graphAddr(m.from), to: graphList(m.toRecipients), subject: m.subject ?? "",
      snippet: m.bodyPreview ?? "", date: m.receivedDateTime, unread: !m.isRead,
    }));
  },
  async get(f: Fetch, c: Conn, id: string): Promise<MessageFull> {
    const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`;
    const m = (await call(f, `${url}?$select=id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,internetMessageId`, { token: c.token })) as {
      id: string; conversationId: string; subject: string; bodyPreview: string; body: { contentType: string; content: string }; from?: GraphAddr;
      toRecipients?: GraphAddr[]; ccRecipients?: GraphAddr[]; receivedDateTime: string; isRead: boolean; internetMessageId?: string;
    };
    if (!m.isRead) await call(f, url, { token: c.token, method: "PATCH", body: JSON.stringify({ isRead: true }) }).catch(() => null);
    const html = m.body.contentType?.toLowerCase() === "html" ? m.body.content : null;
    return {
      id: m.id, threadId: m.conversationId, from: graphAddr(m.from), to: graphList(m.toRecipients), cc: graphList(m.ccRecipients), subject: m.subject ?? "",
      snippet: m.bodyPreview, date: m.receivedDateTime, unread: false, html, text: html ? m.bodyPreview : m.body.content,
      messageIdHeader: m.internetMessageId ?? null, references: null,
    };
  },
  async send(f: Fetch, c: Conn, m: Outgoing) {
    if (m.replyTo) {
      await call(f, `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.replyTo.id)}/reply`, {
        token: c.token, method: "POST", body: JSON.stringify({ comment: m.body }),
      });
      return;
    }
    await call(f, "https://graph.microsoft.com/v1.0/me/sendMail", {
      token: c.token, method: "POST",
      body: JSON.stringify({
        message: { subject: headerSafe(m.subject), body: { contentType: "Text", content: m.body }, toRecipients: toGraph(m.to), ccRecipients: toGraph(m.cc ?? "") },
        saveToSentItems: true,
      }),
    });
  },
};

// ---- Zoho Mail

const zohoBase = (c: Conn) => `https://mail.zoho.${c.domain || "in"}/api/accounts/${encodeURIComponent(c.providerAccountId ?? "")}`;
type ZohoMsg = { messageId: string; folderId: string; threadId?: string; subject?: string; summary?: string; fromAddress?: string; sender?: string; toAddress?: string; ccAddress?: string; receivedTime?: string; status?: string };
const zohoSummary = (m: ZohoMsg): MessageSummary => ({
  id: `${m.folderId}:${m.messageId}`, threadId: m.threadId ?? null, from: m.sender ? `${m.sender} <${m.fromAddress ?? ""}>` : m.fromAddress ?? "",
  to: (m.toAddress ?? "").replace(/&lt;|&gt;/g, (x) => (x === "&lt;" ? "<" : ">")), subject: m.subject ?? "", snippet: m.summary ?? "",
  date: new Date(Number(m.receivedTime ?? Date.now())).toISOString(), unread: m.status === "0",
});

const zoho = {
  async list(f: Fetch, c: Conn, q?: string): Promise<MessageSummary[]> {
    const url = q
      ? `${zohoBase(c)}/messages/search?limit=20&searchKey=${encodeURIComponent(`entire:${q}`)}`
      : `${zohoBase(c)}/messages/view?folderId=${encodeURIComponent(c.inboxFolderId ?? "")}&limit=20`;
    const r = (await call(f, url, { token: c.token, scheme: "Zoho-oauthtoken" })) as { data: ZohoMsg[] };
    return (r.data ?? []).map(zohoSummary);
  },
  async get(f: Fetch, c: Conn, id: string): Promise<MessageFull> {
    const [folderId, messageId] = id.split(":");
    const path = `${zohoBase(c)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}`;
    const [details, content] = await Promise.all([
      call(f, `${path}/details`, { token: c.token, scheme: "Zoho-oauthtoken" }) as Promise<{ data: ZohoMsg }>,
      call(f, `${path}/content`, { token: c.token, scheme: "Zoho-oauthtoken" }) as Promise<{ data: { content: string } }>,
    ]);
    const s = zohoSummary({ ...details.data, folderId, messageId });
    return { ...s, unread: false, cc: details.data.ccAddress ?? "", html: content.data.content, text: s.snippet, messageIdHeader: null, references: null };
  },
  async send(f: Fetch, c: Conn, m: Outgoing) {
    const body = { fromAddress: c.email, toAddress: m.to, ...(m.cc ? { ccAddress: m.cc } : {}), subject: headerSafe(m.subject), content: m.body, mailFormat: "plaintext" };
    if (m.replyTo) {
      const [, messageId] = m.replyTo.id.split(":");
      await call(f, `${zohoBase(c)}/messages/${encodeURIComponent(messageId)}`, { token: c.token, scheme: "Zoho-oauthtoken", method: "POST", body: JSON.stringify({ ...body, action: "reply" }) });
      return;
    }
    await call(f, `${zohoBase(c)}/messages`, { token: c.token, scheme: "Zoho-oauthtoken", method: "POST", body: JSON.stringify(body) });
  },
};

export const ADAPTERS = { google: gmail, microsoft, zoho } as const;

/** A sandboxed page for showing an email's HTML: no scripts, no forms, nothing loaded but images. */
export function emailFrameDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:"><base target="_blank"><style>body{font-family:system-ui,sans-serif;color:#0f172a;background:#fff;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}
