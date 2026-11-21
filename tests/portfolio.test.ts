import assert from "node:assert/strict";
import { test } from "node:test";
import { capTable, exitAllowed, position, type Txn } from "../src/lib/portfolio-calc.ts";

const t = (kind: Txn["kind"], date: string, amount: bigint, costRecovered = 0n): Txn => ({ kind, date, amount, costRecovered });

test("cost, a later valuation, income and MOIC", () => {
  const p = position([
    t("invest", "2026-04-01", 10_00_000_00n),
    t("income", "2026-06-01", 50_000_00n),
    t("valuation", "2026-09-30", 15_00_000_00n),
  ]);
  assert.equal(p.invested, 10_00_000_00n);
  assert.equal(p.currentValue, 15_00_000_00n);
  assert.equal(p.unrealizedGain, 5_00_000_00n);
  assert.equal(p.income, 50_000_00n);
  assert.equal(p.moic, 1.55);
  assert.equal(p.valuedOn, "2026-09-30");
});

test("a partial exit realises gain on the cost it recovers; an old mark no longer counts", () => {
  const txns = [
    t("invest", "2026-04-01", 10_00_000_00n),
    t("valuation", "2026-05-01", 20_00_000_00n),
    t("exit", "2026-06-01", 8_00_000_00n, 4_00_000_00n),
  ];
  const p = position(txns);
  assert.equal(p.realizedGain, 4_00_000_00n);
  assert.equal(p.costRemaining, 6_00_000_00n);
  assert.equal(p.currentValue, 6_00_000_00n, "the valuation predates the exit, so cost is used");
  assert.equal(p.moic, 1.4);
  assert.equal(exitAllowed(txns, 6_00_000_00n), true);
  assert.equal(exitAllowed(txns, 6_00_000_01n), false);
});

test("nothing invested gives no MOIC", () => {
  assert.equal(position([]).moic, null);
});

test("cap table merges holders and sums to 100%", () => {
  const c = capTable([
    { holder: "Boring PE", shares: 7000, invested: 70_000_00n },
    { holder: "Operator", shares: 2000, invested: 0n },
    { holder: "Boring PE", shares: 1000, invested: 10_000_00n },
  ]);
  assert.equal(c.total, 10000);
  assert.equal(c.holders[0].holder, "Boring PE");
  assert.equal(c.holders[0].percent, 80);
  assert.equal(c.holders[0].invested, 80_000_00n);
  assert.equal(Math.round(c.holders.reduce((s, h) => s + h.percent, 0)), 100);
});
