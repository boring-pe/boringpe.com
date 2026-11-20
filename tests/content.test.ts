import assert from "node:assert/strict";
import { test } from "node:test";
import { SITES, cleanContent, defaultsFor, isSiteId } from "../src/lib/content-fields.ts";

test("every field has a default within its own limit", () => {
  for (const site of Object.values(SITES)) {
    for (const field of site.fields) assert.ok(field.default.length <= field.max, field.key);
  }
});

test("only the two real sites are valid", () => {
  assert.equal(isSiteId("boringpe"), true);
  assert.equal(isSiteId("rahulmane"), true);
  assert.equal(isSiteId("other"), false);
});

test("valid input is trimmed and kept", () => {
  const { values, errors } = cleanContent("boringpe", { badge: "  Now open  ", headlineLead: "Hello" });
  assert.deepEqual(errors, []);
  assert.equal(values.badge, "Now open");
  assert.equal(values.headlineLead, "Hello");
});

test("an emptied required field falls back to the default instead of blanking the page", () => {
  const { values, reset } = cleanContent("boringpe", { badge: "   " });
  assert.ok(reset.includes("badge"));
  assert.equal("badge" in values, false);
});

test("an emptied optional field is kept empty, which hides that part of the page", () => {
  const { values, reset } = cleanContent("rahulmane", { bio: "", contactEmail: "" });
  assert.equal(values.bio, "");
  assert.equal(values.contactEmail, "");
  assert.equal(reset.includes("bio"), false);
});

test("too-long text and bad emails are rejected", () => {
  const long = cleanContent("boringpe", { badge: "x".repeat(81) });
  assert.equal(long.errors.length, 1);
  const mail = cleanContent("rahulmane", { contactEmail: "not an email" });
  assert.equal(mail.errors.length, 1);
});

test("unknown keys and non-text values are ignored", () => {
  const { values } = cleanContent("rahulmane", { name: "Rahul Mane", hacked: "<script>", tagline: 42 });
  assert.equal("hacked" in values, false);
  assert.equal("tagline" in values, false);
  assert.equal(values.name, "Rahul Mane");
});

test("single-line fields collapse whitespace, multi-line fields keep paragraphs", () => {
  const { values } = cleanContent("rahulmane", { name: "Rahul\n  Mane", bio: "One.\r\n\r\nTwo." });
  assert.equal(values.name, "Rahul Mane");
  assert.equal(values.bio, "One.\n\nTwo.");
});

test("defaults cover every field", () => {
  for (const id of ["boringpe", "rahulmane"] as const) {
    assert.equal(Object.keys(defaultsFor(id)).length, SITES[id].fields.length);
  }
});
