import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMemberships, enterable, resolveView, sectionInView, views, workspaceLabel, workspacesInView } from "../src/lib/workspace-calc.ts";

test("the Super Admin enters all three workspaces and the combined view", () => {
  assert.deepEqual(enterable("super_admin", []), ["personal", "boring_pe", "impact_marrow"]);
  assert.deepEqual(views("super_admin", null), ["personal", "boring_pe", "impact_marrow", "all"]);
});

test("nobody else ever enters Personal, even if it is stored against them", () => {
  for (const role of ["admin", "partner", "operator", "lp", "founder", "cobuild_partner"]) {
    assert.ok(!enterable(role, ["personal", "boring_pe", "impact_marrow"]).includes("personal"), role);
    assert.ok(!views(role, ["boring_pe"]).includes("all"), `${role}: one workspace has no combined view`);
    assert.ok(!workspacesInView("all", role, ["boring_pe", "impact_marrow"]).includes("personal"), `${role}: combined never means Personal`);
  }
  assert.deepEqual(enterable("admin", ["impact_marrow"]), ["impact_marrow"]);
  assert.deepEqual(enterable("partner", []), ["boring_pe"], "a seat with nothing set lands in Boring PE");
});

test("the stored view is kept only while still allowed", () => {
  assert.equal(resolveView("super_admin", [], "personal"), "personal");
  assert.equal(resolveView("super_admin", [], null), "all", "the owner starts on the combined view");
  assert.equal(resolveView("admin", ["boring_pe"], "personal"), "boring_pe");
  assert.equal(resolveView("admin", ["impact_marrow"], "all"), "impact_marrow");
  assert.equal(resolveView("admin", ["boring_pe", "impact_marrow"], null), "all", "an Admin of both starts with both together");
});

test("a view shows its own workspace, or every enterable one when combined", () => {
  assert.deepEqual(workspacesInView("personal", "super_admin", []), ["personal"]);
  assert.deepEqual(workspacesInView("all", "super_admin", []), ["personal", "boring_pe", "impact_marrow"]);
  assert.deepEqual(workspacesInView("all", "admin", ["boring_pe", "impact_marrow"]), ["boring_pe", "impact_marrow"]);
});

test("memberships typed on the Access page are cleaned", () => {
  assert.deepEqual(cleanMemberships(["impact_marrow", "personal", "x", "boring_pe", "boring_pe"]), ["boring_pe", "impact_marrow"]);
});

test("the menu changes with the workspace", () => {
  assert.ok(sectionInView("ventures", "boring_pe"));
  assert.ok(!sectionInView("ventures", "personal"));
  assert.ok(!sectionInView("ventures", "impact_marrow"));
  assert.ok(sectionInView("personal", "personal") && !sectionInView("personal", "boring_pe"));
  assert.ok(sectionInView("books", "personal"), "unlisted sections show everywhere");
  assert.equal(workspaceLabel("all"), "All workspaces");
  assert.equal(workspaceLabel("impact_marrow"), "Impact Marrow");
});
