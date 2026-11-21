import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GROUPS,
  ROLES,
  SECTIONS,
  allowedSections,
  assignableRoles,
  can,
  canManageRole,
  firstAllowedHref,
  isRole,
} from "../src/lib/rbac.ts";

test("only the Super Admin reaches the console, site content and the personal desk", () => {
  for (const section of ["console", "content", "personal"] as const) {
    for (const role of ROLES) assert.equal(can(role, section), role === "super_admin", `${role} ${section}`);
  }
});

test("access control is for admins and the Super Admin only", () => {
  for (const role of ROLES) assert.equal(can(role, "access"), role === "admin" || role === "super_admin");
});

test("the Super Admin can open every section", () => {
  for (const section of SECTIONS) assert.equal(can("super_admin", section.id), true);
});

test("the deal pipeline is closed to operators, founders and LPs", () => {
  assert.equal(can("partner", "deals"), true);
  for (const role of ["operator", "founder", "lp"] as const) assert.equal(can(role, "deals"), false);
});

test("approvals are open to the Super Admin and operating roles, not founders or LPs", () => {
  for (const role of ["super_admin", "admin", "partner", "operator"] as const) assert.equal(can(role, "approvals"), true);
  for (const role of ["founder", "lp"] as const) assert.equal(can(role, "approvals"), false);
});

test("landing page per role", () => {
  assert.equal(firstAllowedHref("super_admin"), "/portal/console");
  for (const role of ROLES.filter((r) => r !== "super_admin")) {
    assert.equal(firstAllowedHref(role), "/portal/dashboard");
  }
});

test("admins can hand out only the lower roles", () => {
  assert.deepEqual(assignableRoles("admin"), ["partner", "operator", "cobuild_partner", "founder", "lp"]);
  assert.deepEqual(assignableRoles("super_admin"), [...ROLES]);
  for (const role of ["partner", "operator", "cobuild_partner", "founder", "lp"] as const) assert.deepEqual(assignableRoles(role), []);
});

test("admins cannot touch admins or the Super Admin; the Super Admin can touch anyone", () => {
  assert.equal(canManageRole("admin", "admin"), false);
  assert.equal(canManageRole("admin", "super_admin"), false);
  assert.equal(canManageRole("admin", "lp"), true);
  for (const role of ROLES) assert.equal(canManageRole("super_admin", role), true);
  for (const actor of ["partner", "operator", "founder", "lp"] as const) {
    for (const target of ROLES) assert.equal(canManageRole(actor, target), false);
  }
});

test("every section belongs to a known group and allowedSections follows the grants", () => {
  const groups = GROUPS.map((g) => g.id);
  for (const section of SECTIONS) assert.ok(groups.includes(section.group));
  assert.deepEqual(allowedSections("lp").map((s) => s.id), ["dashboard", "portfolio", "vault", "inbox", "calendar"]);
});

test("the menu reads as the Business Stack: Intelligence, Ventures, Infrastructure", () => {
  assert.deepEqual(GROUPS.map((g) => g.label), ["Super Admin", "Intelligence", "Ventures", "Infrastructure", "Rahul Mane · private"]);
  const groupOf = (id: string) => SECTIONS.find((s) => s.id === id)?.group;
  for (const id of ["dashboard", "intelligence", "reports", "budgets", "portfolio"]) assert.equal(groupOf(id), "intelligence", id);
  for (const id of ["ventures", "deals", "marrow"]) assert.equal(groupOf(id), "ventures", id);
  for (const id of ["books", "invoices", "bank", "people", "inbox", "whatsapp", "integrations"]) assert.equal(groupOf(id), "infrastructure", id);
  for (const g of GROUPS) assert.ok(SECTIONS.some((s) => s.group === g.id), `${g.label} is not empty`);
});

test("firm-wide insights are for the Super Admin, Admins and partners only", () => {
  for (const r of ROLES) assert.equal(can(r, "intelligence"), ["super_admin", "admin", "partner"].includes(r), r);
});

test("MIS reports are for the Super Admin, Admins and partners only", () => {
  for (const r of ROLES) assert.equal(can(r, "reports"), ["super_admin", "admin", "partner"].includes(r), r);
});

test("unknown roles are rejected, never defaulted to a powerful one", () => {
  assert.equal(isRole("super_admin"), true);
  assert.equal(isRole("root"), false);
  assert.equal(isRole(undefined), false);
  assert.equal(isRole(null), false);
});

test("appearance preferences are cleaned whatever is stored", async () => {
  const { cleanPrefs, DEFAULT_PREFS } = await import("../src/lib/prefs-fields.ts");
  assert.deepEqual(cleanPrefs(null), DEFAULT_PREFS);
  assert.deepEqual(cleanPrefs({ theme: "dark", accent: "navy", density: "compact", pinned: ["books", "books", "<x>", 5] }),
    { theme: "dark", accent: "navy", density: "compact", pinned: ["books"] });
  assert.equal(cleanPrefs({ theme: "neon", accent: "#ff0000" }).accent, "green");
});
