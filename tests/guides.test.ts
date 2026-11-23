import assert from "node:assert/strict";
import { test } from "node:test";
import { GUIDES, progress } from "../src/lib/guides-calc.ts";

const all = () => true;

test("every step points inside the portal and guide ids are unique", () => {
  assert.equal(new Set(GUIDES.map((g) => g.id)).size, GUIDES.length);
  for (const g of GUIDES) for (const s of g.steps) assert.match(s.href, /^\/portal\//, `${g.id}: ${s.title}`);
});

test("progress counts only checkable steps and finds the next one", () => {
  const bill = GUIDES.find((g) => g.id === "bill")!;
  const p = progress(bill, { parties: 2, invoices: 1, issued: 0 }, all);
  assert.equal(p.done, 2);
  assert.equal(p.total, 6);
  assert.equal(p.next?.title, "Issue it");
  assert.equal(p.complete, false);
  const close = GUIDES.find((g) => g.id === "close")!;
  const c = progress(close, { bankImports: 1, unmatched: 0, payRuns: 1, venturePeriods: 1, depreciation: 1, backups: 1 }, all);
  assert.ok(c.complete, "a step with nothing to check never blocks completion");
});

test("steps a role cannot open are left out", () => {
  const bill = GUIDES.find((g) => g.id === "bill")!;
  const p = progress(bill, {}, (s) => s !== "bank");
  assert.ok(!p.steps.some((s) => s.section === "bank"));
});
