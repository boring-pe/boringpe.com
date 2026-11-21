import assert from "node:assert/strict";
import { test } from "node:test";
import { daysBetween, fiscalYearOf, overlapDays, payslip, rangesOverlap } from "../src/lib/hr-calc.ts";

const base = { monthlyGross: 60_000_00n, tdsBps: 1000, otherDeduction: 1_800_00n, joinDate: "2026-01-01", exitDate: null, lopDays: 0 };

test("calendar helpers", () => {
  assert.equal(daysBetween("2026-10-05", "2026-10-07"), 3);
  assert.equal(overlapDays("2026-09-28", "2026-10-03", "2026-10-01"), 3);
  assert.equal(overlapDays("2026-11-01", "2026-11-03", "2026-10-01"), 0);
  assert.deepEqual(fiscalYearOf("2027-02-10"), ["2026-04-01", "2027-03-31"]);
  assert.equal(rangesOverlap(["2026-10-01", "2026-10-03"], ["2026-10-03", "2026-10-05"]), true);
  assert.equal(rangesOverlap(["2026-10-01", "2026-10-02"], ["2026-10-03", "2026-10-05"]), false);
});

test("a full month pays the full gross less TDS and the fixed deduction", () => {
  const p = payslip(base, "2026-10-01");
  assert.equal(p.gross, 60_000_00n);
  assert.equal(p.tds, 6_000_00n);
  assert.equal(p.net, 52_200_00n);
});

test("unpaid leave is deducted pro rata to calendar days", () => {
  const p = payslip({ ...base, lopDays: 3 }, "2026-10-01");
  assert.equal(p.payableDays, 28);
  assert.equal(p.gross, 54_193_55n);
  assert.equal(p.tds, 5_419_36n);
  assert.equal(p.net, 46_974_19n);
});

test("joining or leaving mid-month pays only the days employed", () => {
  assert.equal(payslip({ ...base, joinDate: "2026-10-17" }, "2026-10-01").payableDays, 15);
  assert.equal(payslip({ ...base, exitDate: "2026-10-10" }, "2026-10-01").payableDays, 10);
  const gone = payslip({ ...base, exitDate: "2026-09-30" }, "2026-10-01");
  assert.equal(gone.gross, 0n);
  assert.equal(gone.net, 0n);
});

test("the fixed deduction never takes net below zero", () => {
  const p = payslip({ ...base, monthlyGross: 1_000_00n, otherDeduction: 5_000_00n }, "2026-10-01");
  assert.equal(p.net, 0n);
});
