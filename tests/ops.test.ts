import assert from "node:assert/strict";
import { test } from "node:test";
import { GATED_STAGES, PILLARS, parseAmount, parseDate, parseOptionalAmount, oneLine, inr } from "../src/lib/ops-fields.ts";
import { ROLES, can } from "../src/lib/rbac.ts";

test("the four framework pillars are exactly Build, Own, Co-Build and Enable", () => {
  assert.deepEqual(PILLARS.map((p) => p.label), ["Build", "Own", "Co-Build", "Enable"]);
});

test("amounts accept Indian commas and reject nonsense", () => {
  assert.equal(parseAmount("1,50,000"), "150000.00");
  assert.equal(parseAmount("₹ 2500.5"), "2500.50");
  for (const bad of ["", "0", "-5", "abc", "1e9", "12.345", "99999999999999", null, 5]) {
    assert.equal(parseAmount(bad as never), null, String(bad));
  }
});

test("an optional amount may be empty but never silently wrong", () => {
  assert.equal(parseOptionalAmount(""), null);
  assert.equal(parseOptionalAmount("abc"), "bad");
  assert.equal(parseOptionalAmount("100"), "100.00");
});

test("dates must be real calendar dates", () => {
  assert.equal(parseDate("2026-11-20"), "2026-11-20");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("20/11/2026"), null);
});

test("text is flattened to one line and capped", () => {
  assert.equal(oneLine("  a \n b  ", 10), "a b");
  assert.equal(oneLine("abcdef", 3), "abc");
});

test("closing and closed are the gated stages", () => {
  assert.deepEqual([...GATED_STAGES], ["closing", "closed"]);
});

test("money is for admins and partners; tasks also for operators and Co-Build partners; nobody else", () => {
  for (const r of ROLES) {
    assert.equal(can(r, "money"), ["super_admin", "admin", "partner"].includes(r), `money ${r}`);
    assert.equal(can(r, "tasks"), ["super_admin", "admin", "partner", "operator", "cobuild_partner"].includes(r), `tasks ${r}`);
  }
});

test("rupees format with Indian grouping", () => {
  assert.match(inr("1500000"), /15,00,000/);
  assert.equal(inr(null), "-");
});
