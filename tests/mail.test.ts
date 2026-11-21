import assert from "node:assert/strict";
import { test } from "node:test";
import { ADAPTERS, buildMime, emailFrameDoc, headerSafe, type Conn } from "../src/lib/mail-providers.ts";

const conn: Conn = { token: "t", email: "rahul@boringpe.com", providerAccountId: "123", inboxFolderId: "9", domain: "in" };
const fake = (routes: Record<string, unknown>, calls: { url: string; init?: RequestInit }[] = []) =>
  (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

test("header values cannot inject new headers", () => {
  assert.equal(headerSafe("a@b.com\r\nBcc: evil@x.com"), "a@b.com Bcc: evil@x.com");
  const mime = buildMime("me@x.com", { to: "you@y.com\nBcc: evil@z.com", subject: "Hi\r\nX: y", body: "Hello ₹" });
  assert.ok(!/\r\nBcc:/.test(mime) && !/\r\nX: y/.test(mime));
  assert.ok(mime.includes("Content-Type: text/plain; charset=UTF-8"));
});

test("Gmail list and read normalise headers, body and unread", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = fake({
    "messages?": { messages: [{ id: "m1" }] },
    "messages/m1?format=metadata": { id: "m1", threadId: "t1", snippet: "Hi there", labelIds: ["INBOX", "UNREAD"], internalDate: "1763700000000",
      payload: { headers: [{ name: "From", value: "Asha <asha@x.com>" }, { name: "Subject", value: "Term sheet" }] } },
    "messages/m1?format=full": { id: "m1", threadId: "t1", snippet: "Hi", labelIds: ["UNREAD"], internalDate: "1763700000000",
      payload: { headers: [{ name: "Message-ID", value: "<abc@x>" }], parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Plain ₹").toString("base64url") } }] } },
    "m1/modify": {},
  }, calls);
  const list = await ADAPTERS.google.list(f, conn);
  assert.deepEqual([list[0].from, list[0].subject, list[0].unread], ["Asha <asha@x.com>", "Term sheet", true]);
  const full = await ADAPTERS.google.get(f, conn, "m1");
  assert.equal(full.text, "Plain ₹");
  assert.equal(full.messageIdHeader, "<abc@x>");
  assert.ok(calls.some((c) => c.url.endsWith("/m1/modify")), "opening marks it read");
});

test("Graph reply uses the reply endpoint; a new mail uses sendMail with recipients", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: 202 }); }) as typeof fetch;
  await ADAPTERS.microsoft.send(f, conn, { to: "a@x.com, b@y.com", subject: "Hello", body: "Body" });
  const sent = JSON.parse(String(calls[0].init?.body));
  assert.ok(calls[0].url.endsWith("/me/sendMail"));
  assert.equal(sent.message.toRecipients.length, 2);
  await ADAPTERS.microsoft.send(f, conn, { to: "a@x.com", subject: "Re", body: "Thanks", replyTo: { id: "AAA", threadId: null, from: "", to: "", cc: "", subject: "", snippet: "", date: "", unread: false, html: null, text: "", messageIdHeader: null, references: null } });
  assert.ok(calls[1].url.endsWith("/me/messages/AAA/reply"));
});

test("Zoho lists the inbox folder with its own auth scheme and replies with action reply", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = fake({ "messages/view": { data: [{ messageId: "55", folderId: "9", subject: "Hi", fromAddress: "z@x.com", receivedTime: "1763700000000", status: "0" }] }, "messages/55": {} }, calls);
  const list = await ADAPTERS.zoho.list(f, conn);
  assert.equal(list[0].id, "9:55");
  assert.equal(list[0].unread, true);
  assert.ok(calls[0].url.startsWith("https://mail.zoho.in/api/accounts/123/messages/view?folderId=9"));
  assert.match(String((calls[0].init?.headers as Record<string, string>).Authorization), /^Zoho-oauthtoken t$/);
  await ADAPTERS.zoho.send(f, conn, { to: "z@x.com", subject: "Re: Hi", body: "Ok", replyTo: { ...list[0], cc: "", html: null, text: "", messageIdHeader: null, references: null } });
  assert.equal(JSON.parse(String(calls[1].init?.body)).action, "reply");
});

test("email HTML is shown with scripts and forms blocked", () => {
  const doc = emailFrameDoc("<p>Hi</p><script>alert(1)</script>");
  assert.ok(doc.includes("default-src 'none'"));
});
