import assert from "node:assert/strict";
import { test } from "node:test";
import {
  budgetInsights,
  completeMonths,
  countBySeverity,
  inr,
  receivableInsights,
  runway,
  runwayInsight,
  sortInsights,
  spendingAnomaly,
  ventureInsights,
} from "../src/lib/insights-calc.ts";

const L = (r: number) => BigInt(Math.round(r * 100)); // rupees → paise

test("whole months before today, oldest first, across a year end", () => {
  assert.deepEqual(completeMonths("2026-02-14", 3), ["2025-11", "2025-12", "2026-01"]);
});

test("rupees read in Indian grouping without paise", () => {
  assert.equal(inr(L(1234567.89)), "₹12,34,567");
  assert.equal(inr(L(-500)), "−₹500");
});

test("runway is cash over the average monthly burn; no burn means no runway figure", () => {
  assert.deepEqual(runway(L(600000), [L(-100000), L(-100000), L(-100000)]), { burn: L(100000), months: 6 });
  assert.deepEqual(runway(L(100), [L(5000), L(-1000)]), { burn: 0n, months: null });
  assert.equal(runway(0n, [L(-1)]).months, 0);
});

test("runway severity: under three months is critical, under six a warning", () => {
  assert.equal(runwayInsight("Group", "/", L(250000), [L(-100000)])!.severity, "critical");
  assert.equal(runwayInsight("Group", "/", L(500000), [L(-100000)])!.severity, "warning");
  assert.equal(runwayInsight("Group", "/", L(900000), [L(-100000)])!.severity, "info");
  const good = runwayInsight("Alpha SPV", "/", L(10), [L(500), L(0)])!;
  assert.equal(good.severity, "good");
  assert.match(good.title, /not burning cash/);
  assert.equal(runwayInsight("Empty", "/", 0n, [0n, 0n]), null, "nothing to say about an idle entity");
});

test("overdue receivables group by customer, worst first", () => {
  const list = receivableInsights([
    { number: "BPE/1", party: "Acme", entity: "Boring PE", outstanding: L(1000), daysOverdue: 10 },
    { number: "BPE/2", party: "Zed", entity: "Boring PE", outstanding: L(50000), daysOverdue: 75 },
    { number: "BPE/3", party: "Acme", entity: "Alpha SPV", outstanding: L(2000), daysOverdue: 40 },
    { number: null, party: "Paid", entity: "Boring PE", outstanding: 0n, daysOverdue: 90 },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].severity, "critical");
  assert.match(list[0].title, /Zed owes ₹50,000/);
  assert.equal(list[1].severity, "warning");
  assert.match(list[1].detail, /2 invoices, the oldest 40 days late\. Billed by Boring PE, Alpha SPV/);
});

test("budgets flag income more than 10% short and spending more than 10% over", () => {
  const ok = budgetInsights("Boring PE", "/", "June", { incomeBudget: L(100), incomeActual: L(95), expenseBudget: L(100), expenseActual: L(105) });
  assert.deepEqual(ok, []);
  const bad = budgetInsights("Boring PE", "/", "June", { incomeBudget: L(100), incomeActual: L(60), expenseBudget: L(100), expenseActual: L(120) });
  assert.equal(bad.length, 2);
  assert.match(bad[0].title, /income is 40% behind budget/);
  assert.equal(bad[0].severity, "critical");
  assert.match(bad[1].title, /spending is 20% over budget/);
  assert.equal(bad[1].severity, "warning");
  assert.deepEqual(budgetInsights("X", "/", "June", { incomeBudget: 0n, incomeActual: 0n, expenseBudget: 0n, expenseActual: L(1) }), [], "no budget, no verdict");
});

test("ventures: falling revenue, losses and unclosed months", () => {
  const p = (period: string, revenue: number, net: number) => ({ period, revenue: L(revenue), net: L(net) });
  const fall = ventureInsights("Kiln", "/", "2026-03", [p("2026-01", 100000, 10000), p("2026-02", 100000, 10000), p("2026-03", 50000, -2000)]);
  assert.deepEqual(fall.map((i) => i.id), ["venture-revenue:Kiln", "venture-loss:Kiln"]);
  assert.match(fall[0].title, /fell 50% in March 2026/);
  assert.equal(fall[0].severity, "critical");
  const open = ventureInsights("Kiln", "/", "2026-04", [p("2026-01", 100, 1), p("2026-02", 130, 1)]);
  assert.equal(open[0].id, "venture-open:Kiln");
  assert.equal(open[1].severity, "good");
  assert.match(ventureInsights("New", "/", "2026-04", [])[0].detail, /No monthly statement/);
});

test("unusual spending needs history, 1.5× the usual and at least ₹10,000 more", () => {
  const a = (months: number[]) => ({ scope: "Boring PE", code: "5900", name: "Other expenses", months: months.map(L) });
  assert.equal(spendingAnomaly(a([20000, 20000, 20000, 45000]), "/", "2026-03")!.severity, "warning");
  assert.equal(spendingAnomaly(a([20000, 20000, 20000, 32000]), "/", "2026-03")!.severity, "info");
  assert.equal(spendingAnomaly(a([20000, 20000, 20000, 28000]), "/", "2026-03"), null, "under 1.5×");
  assert.equal(spendingAnomaly(a([1000, 1000, 1000, 5000]), "/", "2026-03"), null, "under ₹10,000 more");
  assert.equal(spendingAnomaly(a([0, 0, 20000, 90000]), "/", "2026-03"), null, "one earlier month is not a pattern");
});

test("insights sort by severity and are counted", () => {
  const mk = (severity: "critical" | "warning" | "info" | "good", scope: string) => ({ id: scope, severity, area: "cash" as const, scope, title: scope, detail: "", href: "/" });
  const sorted = sortInsights([mk("good", "a"), mk("critical", "b"), mk("info", "c"), mk("critical", "a")]);
  assert.deepEqual(sorted.map((i) => `${i.severity}:${i.scope}`), ["critical:a", "critical:b", "info:c", "good:a"]);
  assert.deepEqual(countBySeverity(sorted), { critical: 2, warning: 0, info: 1, good: 1 });
});
