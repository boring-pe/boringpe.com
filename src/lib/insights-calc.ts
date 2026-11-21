// Pure rules for the Intelligence layer: plain-language insights from figures in paise.
// Kept free of imports so the test runner can load it directly.

export type Severity = "critical" | "warning" | "info" | "good";
export type Area = "cash" | "receivables" | "budget" | "ventures" | "spending";

export type Insight = {
  id: string;
  severity: Severity;
  area: Area;
  /** "Group", an entity name or a venture name. */
  scope: string;
  title: string;
  detail: string;
  href: string;
};

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 };
export const AREA_LABEL: Record<Area, string> = {
  cash: "Cash runway",
  receivables: "Receivables",
  budget: "Budget",
  ventures: "Ventures",
  spending: "Unusual spending",
};

/** ₹ in Indian grouping, whole rupees: short enough to read in a sentence. */
export function inr(p: bigint): string {
  const neg = p < 0n;
  const r = (neg ? -p : p) / 100n;
  return `${neg ? "−" : ""}₹${new Intl.NumberFormat("en-IN").format(Number(r))}`;
}

/** The `n` whole months before the month `today` falls in, oldest first, as YYYY-MM. */
export function completeMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Average monthly burn (expenses above income) over the given months, and how many months the
 * cash lasts at that rate. `null` months means the business is not burning cash.
 */
export function runway(cash: bigint, monthlyNet: bigint[]): { burn: bigint; months: number | null } {
  if (monthlyNet.length === 0) return { burn: 0n, months: null };
  const avgNet = monthlyNet.reduce((s, v) => s + v, 0n) / BigInt(monthlyNet.length);
  const burn = avgNet < 0n ? -avgNet : 0n;
  if (burn === 0n) return { burn: 0n, months: null };
  if (cash <= 0n) return { burn, months: 0 };
  return { burn, months: Math.floor(Number((cash * 10n) / burn)) / 10 };
}

export function runwayInsight(scope: string, href: string, cash: bigint, monthlyNet: bigint[]): Insight | null {
  const hasActivity = monthlyNet.some((v) => v !== 0n);
  if (!hasActivity && cash === 0n) return null;
  const r = runway(cash, monthlyNet);
  const id = `cash:${scope}`;
  if (r.months === null) {
    if (!hasActivity) return null;
    return { id, severity: "good", area: "cash", scope, href,
      title: `${scope} is not burning cash`,
      detail: `Income covered expenses over the last ${monthlyNet.length} months. Cash on hand is ${inr(cash)}.` };
  }
  const severity: Severity = r.months < 3 ? "critical" : r.months < 6 ? "warning" : "info";
  const months = r.months === 0 ? "no months" : `about ${r.months.toFixed(1)} months`;
  return { id, severity, area: "cash", scope, href,
    title: `${scope} has ${months} of cash left`,
    detail: `Spending runs ${inr(r.burn)} a month above income (average of the last ${monthlyNet.length} months), against ${inr(cash)} in bank, cash and gateway.` };
}

export type OverdueInvoice = { number: string | null; party: string; entity: string; outstanding: bigint; daysOverdue: number };

/** One insight per customer with overdue invoices, worst first. */
export function receivableInsights(invoices: OverdueInvoice[]): Insight[] {
  const byParty = new Map<string, OverdueInvoice[]>();
  for (const inv of invoices) {
    if (inv.outstanding <= 0n) continue;
    byParty.set(inv.party, [...(byParty.get(inv.party) ?? []), inv]);
  }
  return [...byParty.entries()]
    .map(([party, list]) => {
      const total = list.reduce((s, i) => s + i.outstanding, 0n);
      const oldest = Math.max(...list.map((i) => i.daysOverdue));
      const severity: Severity = oldest > 60 ? "critical" : oldest > 30 ? "warning" : "info";
      const entities = [...new Set(list.map((i) => i.entity))].join(", ");
      const count = list.length === 1 ? `1 invoice${list[0].number ? ` (${list[0].number})` : ""}` : `${list.length} invoices`;
      return { total, insight: { id: `ar:${party}`, severity, area: "receivables" as const, scope: entities, href: "/portal/invoices",
        title: `${party} owes ${inr(total)} past due`,
        detail: `${count}, the oldest ${oldest} day${oldest === 1 ? "" : "s"} late. Billed by ${entities}.` } };
    })
    .sort((a, b) => SEVERITY_ORDER[a.insight.severity] - SEVERITY_ORDER[b.insight.severity] || (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
    .map((x) => x.insight);
}

export type BudgetFigures = { incomeBudget: bigint; incomeActual: bigint; expenseBudget: bigint; expenseActual: bigint };

/** Income short of budget or spending over it by more than 10%, year to date. */
export function budgetInsights(scope: string, href: string, through: string, f: BudgetFigures): Insight[] {
  const out: Insight[] = [];
  const pct = (a: bigint, b: bigint) => Number(((a - b) * 1000n) / b) / 10;
  if (f.incomeBudget > 0n && f.incomeActual * 10n < f.incomeBudget * 9n) {
    const gap = f.incomeBudget - f.incomeActual;
    const behind = Number((gap * 1000n) / f.incomeBudget) / 10;
    out.push({ id: `budget-income:${scope}`, severity: behind >= 25 ? "critical" : "warning", area: "budget", scope, href,
      title: `${scope} income is ${behind}% behind budget`,
      detail: `${inr(f.incomeActual)} earned against ${inr(f.incomeBudget)} budgeted this financial year, through ${through}.` });
  }
  if (f.expenseBudget > 0n && f.expenseActual * 10n > f.expenseBudget * 11n) {
    const over = pct(f.expenseActual, f.expenseBudget);
    out.push({ id: `budget-expense:${scope}`, severity: over >= 25 ? "critical" : "warning", area: "budget", scope, href,
      title: `${scope} spending is ${over}% over budget`,
      detail: `${inr(f.expenseActual)} spent against ${inr(f.expenseBudget)} budgeted this financial year, through ${through}.` });
  }
  return out;
}

export type VenturePeriod = { period: string; revenue: bigint; net: bigint };

/**
 * A venture's latest closed month against the average of the months before it (up to three),
 * plus a nudge when last month's statement has not been closed.
 */
export function ventureInsights(name: string, href: string, lastMonth: string, periods: VenturePeriod[]): Insight[] {
  const out: Insight[] = [];
  const sorted = [...periods].sort((a, b) => a.period.localeCompare(b.period));
  const latest = sorted.at(-1);
  if (!latest || latest.period < lastMonth) {
    out.push({ id: `venture-open:${name}`, severity: "info", area: "ventures", scope: name, href,
      title: `${name} has not closed ${monthLabel(lastMonth)}`,
      detail: latest ? `The last closed statement is ${monthLabel(latest.period)}. Close the month so operator shares and fees post.` : "No monthly statement has been closed yet." });
  }
  if (!latest) return out;
  const prior = sorted.slice(0, -1).slice(-3);
  if (prior.length > 0) {
    const avg = prior.reduce((s, p) => s + p.revenue, 0n) / BigInt(prior.length);
    if (avg > 0n && latest.revenue * 10n < avg * 8n) {
      const drop = Number(((avg - latest.revenue) * 1000n) / avg) / 10;
      out.push({ id: `venture-revenue:${name}`, severity: drop >= 40 ? "critical" : "warning", area: "ventures", scope: name, href,
        title: `${name} revenue fell ${drop}% in ${monthLabel(latest.period)}`,
        detail: `${inr(latest.revenue)} against an average of ${inr(avg)} over the ${prior.length} month${prior.length === 1 ? "" : "s"} before.` });
    } else if (avg > 0n && latest.revenue * 10n > avg * 12n) {
      const rise = Number(((latest.revenue - avg) * 1000n) / avg) / 10;
      out.push({ id: `venture-growth:${name}`, severity: "good", area: "ventures", scope: name, href,
        title: `${name} revenue rose ${rise}% in ${monthLabel(latest.period)}`,
        detail: `${inr(latest.revenue)} against an average of ${inr(avg)} over the ${prior.length} month${prior.length === 1 ? "" : "s"} before.` });
    }
  }
  if (latest.net < 0n) {
    out.push({ id: `venture-loss:${name}`, severity: "warning", area: "ventures", scope: name, href,
      title: `${name} lost ${inr(-latest.net)} in ${monthLabel(latest.period)}`,
      detail: `Costs, fees and operator shares came to more than revenue of ${inr(latest.revenue)}.` });
  }
  return out;
}

export type AccountMonths = { scope: string; code: string; name: string; months: bigint[] };

/** Smallest jump worth mentioning: ₹10,000. */
export const ANOMALY_FLOOR = 1_000_000n;

/**
 * An expense account whose latest month is at least 1.5× its average over earlier months
 * (needing two or more earlier months with spending) and higher by at least ₹10,000.
 * `months` runs oldest first; the last value is the month being checked.
 */
export function spendingAnomaly(a: AccountMonths, href: string, month: string): Insight | null {
  if (a.months.length < 3) return null;
  const latest = a.months.at(-1)!;
  const earlier = a.months.slice(0, -1);
  const active = earlier.filter((v) => v > 0n);
  if (active.length < 2) return null;
  const avg = earlier.reduce((s, v) => s + v, 0n) / BigInt(earlier.length);
  if (latest - avg < ANOMALY_FLOOR || latest * 2n < avg * 3n) return null;
  const times = avg > 0n ? (Number((latest * 10n) / avg) / 10).toFixed(1) : null;
  return { id: `spend:${a.scope}:${a.code}`, severity: latest >= avg * 2n ? "warning" : "info", area: "spending", scope: a.scope, href,
    title: `${a.name} at ${a.scope} jumped${times ? ` to ${times}×` : ""} in ${monthLabel(month)}`,
    detail: `${inr(latest)} against a usual ${inr(avg)} a month over the ${earlier.length} months before.` };
}

export function sortInsights(list: Insight[]): Insight[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.scope.localeCompare(b.scope) || a.title.localeCompare(b.title));
}

export function countBySeverity(list: Insight[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, warning: 0, info: 0, good: 0 };
  for (const i of list) out[i.severity]++;
  return out;
}
