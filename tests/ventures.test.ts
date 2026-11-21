import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBps, feeFor, monthEnd, parseMonth, parsePercent, sharesFit, statement } from "../src/lib/venture-calc.ts";

test("percentages parse to basis points and reject nonsense", () => {
  assert.equal(parsePercent("12.5"), 1250);
  assert.equal(parsePercent("20%"), 2000);
  assert.equal(parsePercent("100"), 10000);
  for (const bad of ["", "101", "-5", "1.234", "abc"]) assert.equal(parsePercent(bad), null, bad);
});

test("basis points round to the nearest paisa", () => {
  assert.equal(applyBps(10_000n, 1250), 1250n);
  assert.equal(applyBps(3n, 5000), 2n); // 1.5 paise rounds up
  assert.equal(applyBps(-100n, 5000), 0n);
});

test("fee rules", () => {
  assert.equal(feeFor({ type: "none", fixed: 0n, bps: 0 }, 1_00_000_00n), 0n);
  assert.equal(feeFor({ type: "fixed", fixed: 25_000_00n, bps: 0 }, 0n), 25_000_00n);
  assert.equal(feeFor({ type: "percent", fixed: 0n, bps: 500 }, 1_00_000_00n), 5_000_00n);
});

test("a month: fee and costs first, then operator shares, then the venture's net", () => {
  const s = statement(1_00_000_00n, 30_000_00n, 5_000_00n, [
    { id: "op", basis: "profit", bps: 2000 },
    { id: "sales", basis: "revenue", bps: 500 },
  ]);
  assert.equal(s.profit, 65_000_00n);
  assert.deepEqual(s.shares.map((x) => x.amount), [13_000_00n, 5_000_00n]);
  assert.equal(s.net, 47_000_00n);
});

test("a loss gives profit sharers nothing; revenue sharers are still paid", () => {
  const s = statement(10_000_00n, 20_000_00n, 0n, [
    { id: "op", basis: "profit", bps: 5000 },
    { id: "sales", basis: "revenue", bps: 1000 },
  ]);
  assert.deepEqual(s.shares.map((x) => x.amount), [0n, 1_000_00n]);
  assert.equal(s.net, -11_000_00n);
});

test("shares on one basis cannot exceed 100%", () => {
  const ex = [{ id: "a", basis: "profit" as const, bps: 7000 }];
  assert.equal(sharesFit(ex, { id: "b", basis: "profit", bps: 3000 }), true);
  assert.equal(sharesFit(ex, { id: "b", basis: "profit", bps: 3001 }), false);
  assert.equal(sharesFit(ex, { id: "b", basis: "revenue", bps: 9000 }), true);
});

test("months", () => {
  assert.equal(parseMonth("2026-10"), "2026-10-01");
  assert.equal(parseMonth("2026-13"), null);
  assert.equal(monthEnd("2026-02-01"), "2026-02-28");
  assert.equal(monthEnd("2028-02-01"), "2028-02-29");
});
