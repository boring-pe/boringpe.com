import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { google, istToIso, microsoft } from "../src/lib/calendar-providers.ts";
import { linkReference, parsePaidLink, validRazorpaySignature } from "../src/lib/razorpay-calc.ts";

const fake = (body: unknown, calls: { url: string; init?: RequestInit }[] = []) =>
  (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status: 200 }); }) as typeof fetch;

test("India time converts to UTC", () => {
  assert.equal(istToIso("2026-11-25T15:00"), "2026-11-25T09:30:00.000Z");
});

test("Google events normalise, skip cancelled ones, and creation asks for a Meet link", async () => {
  const list = await google.list(fake({ items: [
    { id: "a", summary: "IC meeting", start: { dateTime: "2026-11-25T15:00:00+05:30" }, end: { dateTime: "2026-11-25T16:00:00+05:30" }, hangoutLink: "https://meet.google.com/x", attendees: [{ email: "a@x.com" }] },
    { id: "b", summary: "Gone", status: "cancelled", start: { date: "2026-11-26" }, end: { date: "2026-11-27" } },
  ] }), "t", "a", "b");
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].title, list[0].joinUrl, list[0].attendees[0]], ["IC meeting", "https://meet.google.com/x", "a@x.com"]);
  const calls: { url: string; init?: RequestInit }[] = [];
  await google.create(fake({ id: "n1" }, calls), "t", { title: "Call", description: "d", startLocal: "2026-11-25T15:00", endLocal: "2026-11-25T15:30", attendees: ["b@y.com"], online: true });
  const sent = JSON.parse(String(calls[0].init?.body));
  assert.equal(sent.start.timeZone, "Asia/Kolkata");
  assert.equal(sent.start.dateTime, "2026-11-25T15:00:00");
  assert.ok(sent.conferenceData && calls[0].url.includes("conferenceDataVersion=1"));
});

test("Graph events come back in UTC and creation uses India Standard Time", async () => {
  const list = await microsoft.list(fake({ value: [{ id: "m", subject: "Board", start: { dateTime: "2026-11-25T09:30:00.0000000" }, end: { dateTime: "2026-11-25T10:30:00.0000000" }, onlineMeeting: { joinUrl: "https://teams/x" } }] }), "t", "a", "b");
  assert.equal(list[0].start, "2026-11-25T09:30:00Z");
  const calls: { url: string; init?: RequestInit }[] = [];
  await microsoft.create(fake({ id: "n" }, calls), "t", { title: "T", description: "", startLocal: "2026-11-25T15:00", endLocal: "2026-11-25T16:00", attendees: [], online: false });
  assert.equal(JSON.parse(String(calls[0].init?.body)).start.timeZone, "India Standard Time");
});

test("Razorpay signatures and paid-link events", () => {
  const body = '{"event":"payment_link.paid"}';
  const sig = createHmac("sha256", "whs").update(body).digest("hex");
  assert.equal(validRazorpaySignature(body, sig, "whs"), true);
  assert.equal(validRazorpaySignature(body, sig, "other"), false);
  assert.equal(validRazorpaySignature(body, "nothex", "whs"), false);
  const paid = parsePaidLink({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", amount_paid: 118000 } }, payment: { entity: { id: "pay_1", amount: 118000, fee: 2832, tax: 432, method: "upi" } } } });
  assert.deepEqual(paid && [paid.linkId, paid.amountPaise, paid.feePaise, paid.taxPaise], ["plink_1", 118000n, 2832n, 432n]);
  assert.equal(parsePaidLink({ event: "payment.captured" }), null);
  assert.equal(linkReference("INV/2026-27/0001", 0), "INV/2026-27/0001");
  assert.equal(linkReference("X".repeat(50), 2).length, 40);
});
