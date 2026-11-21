import assert from "node:assert/strict";
import { test } from "node:test";
import { convertLines, disposal, fyMonths, monthlyDepreciation, parseRate, rateText, spreadAnnual, toInr } from "../src/lib/assets-calc.ts";

const laptop = { cost: 1_20_000_00n, salvage: 0n, method: "slm" as const, lifeMonths: 36, wdvBps: 4000, purchaseDate: "2026-04-01" };

test("straight line: equal months, a part first month, never past cost less salvage", () => {
  assert.equal(monthlyDepreciation(laptop, "2026-03-01", 0n), 0n);
  assert.equal(monthlyDepreciation(laptop, "2026-04-01", 0n), 3_333_33n);
  assert.equal(monthlyDepreciation({ ...laptop, purchaseDate: "2026-04-16" }, "2026-04-01", 0n), 1_666_67n); // 15 of 30 days
  assert.equal(monthlyDepreciation(laptop, "2029-03-01", 1_19_999_00n), 1_00n);
  assert.equal(monthlyDepreciation(laptop, "2029-04-01", 1_20_000_00n), 0n);
  assert.equal(monthlyDepreciation({ ...laptop, salvage: 20_000_00n }, "2026-05-01", 99_999_00n), 1_00n);
});

test("written-down value charges a twelfth of the yearly rate on what remains", () => {
  const wdv = { ...laptop, method: "wdv" as const };
  assert.equal(monthlyDepreciation(wdv, "2026-04-01", 0n), 4_000_00n);
  assert.equal(monthlyDepreciation(wdv, "2026-05-01", 4_000_00n), 3_866_67n);
});

test("disposal gain or loss", () => {
  assert.deepEqual(disposal(1_00_000_00n, 60_000_00n, 50_000_00n), { book: 40_000_00n, gain: 10_000_00n });
  assert.equal(disposal(1_00_000_00n, 60_000_00n, 0n).gain, -40_000_00n);
});

test("budgets spread over the financial year", () => {
  const s = spreadAnnual(1_000_01n);
  assert.equal(s.length, 12);
  assert.equal(s.reduce((a, b) => a + b, 0n), 1_000_01n);
  assert.deepEqual(fyMonths(2026).slice(0, 2), ["2026-04-01", "2026-05-01"]);
  assert.equal(fyMonths(2026)[11], "2027-03-01");
});

test("currency: rates, conversion, and balanced entries after rounding", () => {
  assert.equal(parseRate("83.4567"), 83_456_700n);
  assert.equal(parseRate("0"), null);
  assert.equal(rateText(83_456_700n), "83.4567");
  assert.equal(toInr(100_00n, 83_456_700n), 8_345_67n);
  const lines = convertLines([
    { code: "a", debit: 1n, credit: 0n }, { code: "b", debit: 1n, credit: 0n }, { code: "c", debit: 0n, credit: 2n },
  ], 1_500_000n); // 1.5: each 1.5 paise rounds to 2, the 3 paise credit stays 3
  assert.equal(lines.reduce((s, l) => s + l.debit, 0n), lines.reduce((s, l) => s + l.credit, 0n));
});
