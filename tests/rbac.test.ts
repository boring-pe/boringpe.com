import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLES, SECTIONS, allowedSections, can, firstAllowedHref, isRole } from "../src/lib/rbac.ts";

test("only admins reach access control", () => {
  for (const role of ROLES) assert.equal(can(role, "access"), role === "admin");
});

test("the deal pipeline is closed to operators, founders and LPs", () => {
  assert.equal(can("partner", "deals"), true);
  for (const role of ["operator", "founder", "lp"] as const) assert.equal(can(role, "deals"), false);
});

test("every role can open at least the dashboard", () => {
  for (const role of ROLES) {
    assert.equal(can(role, "dashboard"), true);
    assert.equal(firstAllowedHref(role), "/portal/dashboard");
  }
});

test("allowedSections follows the grants and only lists real sections", () => {
  const ids = SECTIONS.map((s) => s.id);
  for (const role of ROLES) for (const s of allowedSections(role)) assert.ok(ids.includes(s.id));
  assert.deepEqual(allowedSections("lp").map((s) => s.id), ["dashboard", "portfolio"]);
});

test("unknown roles are rejected, never defaulted to admin", () => {
  assert.equal(isRole("admin"), true);
  assert.equal(isRole("root"), false);
  assert.equal(isRole(undefined), false);
  assert.equal(isRole(null), false);
});
