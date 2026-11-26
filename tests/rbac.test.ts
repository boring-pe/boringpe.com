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
  assert.deepEqual(allowedSections("lp").map((s) => s.id), ["dashboard", "assistant", "inbox", "calendar", "portfolio", "vault"]);
});

test("the menu is MECE: eight groups, each answering one question, every page in exactly one", () => {
  assert.deepEqual(GROUPS.map((g) => g.label), [
    "Overview", "Pipeline & contacts", "Verticals & holdings", "Money & books", "People & work", "Records & compliance", "Admin", "Rahul Mane · private",
  ]);
  const groupOf = (id: string) => SECTIONS.find((s) => s.id === id)?.group;
  const expect: Record<string, string[]> = {
    overview: ["dashboard", "intelligence", "assistant", "guides"],
    pipeline: ["deals", "parties", "inbox", "whatsapp", "calendar"],
    verticals: ["v_build", "v_co_build", "v_own", "v_studio", "ventures", "portfolio", "marrow"],
    finance: ["money", "invoices", "bank", "books", "assets", "budgets", "reports", "networth"],
    work: ["tasks", "approvals", "people"],
    records: ["vault", "kyc", "secrets"],
    admin: ["console", "access", "security", "integrations", "activity", "content"],
    personal: ["personal"],
  };
  for (const [group, ids] of Object.entries(expect)) for (const id of ids) assert.equal(groupOf(id), group, id);
  // Collectively exhaustive: every page is listed above; mutually exclusive: each id once.
  const listed = Object.values(expect).flat();
  assert.equal(new Set(listed).size, listed.length, "no page in two groups");
  assert.deepEqual([...listed].sort(), SECTIONS.map((s) => s.id).sort(), "no page left out");
  assert.deepEqual(SECTIONS.filter((s) => s.id.startsWith("v_")).map((s) => s.label), ["Build", "Co-Build", "Own", "Boring Stack"]);
  for (const g of GROUPS) assert.ok(SECTIONS.some((s) => s.group === g.id), `${g.label} is not empty`);
});

test("contacts are for the same people as deals", () => {
  for (const r of ROLES) assert.equal(can(r, "parties"), can(r, "deals"), r);
});

test("firm-wide insights are for the Super Admin, Admins and partners only", () => {
  for (const r of ROLES) assert.equal(can(r, "intelligence"), ["super_admin", "admin", "partner"].includes(r), r);
});

test("MIS reports are for the Super Admin, Admins and partners only", () => {
  for (const r of ROLES) assert.equal(can(r, "reports"), ["super_admin", "admin", "partner"].includes(r), r);
  for (const r of ROLES) assert.equal(can(r, "networth"), ["super_admin", "admin", "partner"].includes(r), `net worth: ${r}`);
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
