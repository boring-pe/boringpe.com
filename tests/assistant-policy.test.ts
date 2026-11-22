import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMode, effectiveMode, mayRunFullAgent } from "../src/lib/assistant-policy.ts";

test("defaults: she looks things up for anyone; notes only for the owner; money only with a yes", () => {
  assert.equal(defaultMode("lp", "read"), "auto");
  assert.equal(defaultMode("admin", "notes"), "off");
  assert.equal(defaultMode("super_admin", "notes"), "auto");
  assert.equal(defaultMode("super_admin", "money"), "ask");
  assert.equal(defaultMode("partner", "money"), "off");
  assert.equal(defaultMode("lp", "email"), "off");
  assert.equal(defaultMode("operator", "email"), "ask");
});

test("a person can only make her more careful than their role allows", () => {
  assert.equal(effectiveMode("admin", "tasks", {}, { tasks: "ask" }, false), "ask");
  assert.equal(effectiveMode("admin", "email", {}, { email: "auto" }, false), "ask", "cannot raise above the role");
  assert.equal(effectiveMode("admin", "email", { email: "off" }, {}, false), "off", "the role setting wins");
});

test("full agent: everything the role allows happens on its own, except money", () => {
  assert.equal(effectiveMode("super_admin", "email", {}, {}, true), "auto");
  assert.equal(effectiveMode("super_admin", "whatsapp", {}, { whatsapp: "ask" }, true), "auto");
  assert.equal(effectiveMode("super_admin", "money", {}, {}, true), "ask", "money always waits for a yes");
  assert.equal(effectiveMode("admin", "notes", {}, {}, true), "off", "full agent never opens what the role does not allow");
  assert.equal(effectiveMode("super_admin", "money", { money: "auto" }, {}, false), "ask", "the ceiling holds even if set higher");
});

test("full agent is only for the roles chosen", () => {
  assert.ok(mayRunFullAgent("super_admin", ["super_admin"]));
  assert.ok(!mayRunFullAgent("admin", ["super_admin"]));
});
