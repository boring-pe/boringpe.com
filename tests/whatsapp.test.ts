import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { describe, nextStatus, normalizePhone, parseWebhook, validSignature, windowOpen } from "../src/lib/whatsapp-calc.ts";

test("phone numbers", () => {
  assert.equal(normalizePhone("+91 98765 43210"), "919876543210");
  assert.equal(normalizePhone("98765-43210"), "919876543210");
  assert.equal(normalizePhone("0044 7700 900123"), "447700900123");
  assert.equal(normalizePhone("12345"), null);
});

test("signatures must match the raw body exactly", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
  assert.equal(validSignature(body, sig, "s3cret"), true);
  assert.equal(validSignature(body + " ", sig, "s3cret"), false);
  assert.equal(validSignature(body, sig, "other"), false);
  assert.equal(validSignature(body, null, "s3cret"), false);
  assert.equal(validSignature(body, "sha256=zz", "s3cret"), false);
});

const payload = (phoneNumberId: string) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "91 22", phone_number_id: phoneNumberId },
    contacts: [{ profile: { name: "Meera" }, wa_id: "919800000001" }],
    messages: [
      { from: "919800000001", id: "wamid.A", timestamp: "1763700000", type: "text", text: { body: "Is the deck ready?" } },
      { from: "919800000001", id: "wamid.B", timestamp: "1763700060", type: "image", image: { caption: "site photo" } },
    ],
    statuses: [{ id: "wamid.OUT", status: "failed", errors: [{ title: "Re-engagement message", message: "More than 24 hours" }] }],
  } }] }],
});

test("webhook parsing for our number only", () => {
  const r = parseWebhook(payload("PN1"), "PN1");
  assert.equal(r.messages.length, 2);
  assert.deepEqual([r.messages[0].name, r.messages[0].body, r.messages[1].body], ["Meera", "Is the deck ready?", "[photo] site photo"]);
  assert.equal(r.statuses[0].status, "failed");
  assert.match(r.statuses[0].error ?? "", /24 hours/);
  assert.deepEqual(parseWebhook(payload("OTHER"), "PN1"), { messages: [], statuses: [] });
  assert.deepEqual(parseWebhook({ object: "page" }, "PN1"), { messages: [], statuses: [] });
});

test("the 24-hour window and status order", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(windowOpen("2026-11-20T13:00:00Z", now), true);
  assert.equal(windowOpen("2026-11-20T11:00:00Z", now), false);
  assert.equal(windowOpen(null, now), false);
  assert.equal(nextStatus("read", "delivered"), "read");
  assert.equal(nextStatus("sent", "read"), "read");
  assert.equal(nextStatus("delivered", "failed"), "failed");
  assert.equal(describe({ from: "1", id: "x", timestamp: "0", type: "interactive", interactive: { button_reply: { title: "Yes" } } }), "Yes");
});
