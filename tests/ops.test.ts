import assert from "node:assert/strict";
import { test } from "node:test";
import { GATED_STAGES, PILLARS, VERTICALS, isVertical, verticalBySlug, verticalLabel, parseAmount, parseDate, parseOptionalAmount, oneLine, inr } from "../src/lib/ops-fields.ts";
import { ROLES, can } from "../src/lib/rbac.ts";

test("the four verticals are Build, Own, Co-Build and Boring Studio (Enable)", () => {
  assert.deepEqual(PILLARS.map((p) => p.label), ["Build", "Own", "Co-Build", "Boring Studio"]);
  assert.deepEqual(VERTICALS.map((v) => v.label), ["Build", "Co-Build", "Own", "Boring Studio"]);
  assert.equal(verticalBySlug("studio")?.id, "enable", "Boring Studio keeps the id 'enable'");
  assert.equal(verticalLabel("co_build"), "Co-Build");
  assert.ok(isVertical("own") && !isVertical("studio"));
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

test("money entries post to the right accounts and balance", async () => {
  const { moneyLines, counts } = await import("../src/lib/money-books.ts");
  const inLines = moneyLines("in", "investment", 100n);
  assert.deepEqual(inLines.map((l) => l.code), ["1010", "3010"]);
  const out = moneyLines("out", "salary", 50n);
  assert.deepEqual(out.map((l) => [l.code, l.debit, l.credit]), [["5010", 50n, 0n], ["1010", 0n, 50n]]);
  for (const dir of ["in", "out"] as const) {
    for (const c of ["investment", "fee", "expense", "payout", "salary", "other", "unknown"]) {
      const lines = moneyLines(dir, c, 7n);
      assert.equal(lines.reduce((s, l) => s + l.debit, 0n), lines.reduce((s, l) => s + l.credit, 0n));
    }
  }
  assert.equal(counts("recorded") && counts("approved"), true);
  assert.equal(counts("awaiting_approval") || counts("rejected") || counts("withdrawn"), false);
});
