// Pure MIS maths in paise: group consolidation and month buckets.

export type EntityFigures = { income: bigint; expense: bigint; cash: bigint; assets: bigint; liabilities: bigint };

/**
 * Adds up every entity and removes Business Studio fees our own entities charge each other,
 * which are income in Boring PE and an expense in the venture: the group neither earns nor spends them.
 */
export function consolidate(rows: EntityFigures[], intercompany: bigint) {
  const sum = (f: (r: EntityFigures) => bigint) => rows.reduce((s, r) => s + f(r), 0n);
  const income = sum((r) => r.income) - intercompany;
  const expense = sum((r) => r.expense) - intercompany;
  return { income, expense, net: income - expense, cash: sum((r) => r.cash), assets: sum((r) => r.assets), liabilities: sum((r) => r.liabilities) };
}

/** Every month from `from` to `to` as "YYYY-MM", in order. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Fills missing months with zero so a trend has no gaps. */
export function fillMonths<T extends { month: string }>(months: string[], rows: T[], empty: (month: string) => T): T[] {
  const by = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => by.get(m) ?? empty(m));
}

/** Width of a bar as a percentage of the largest value, at least a sliver when non-zero. */
export function barPercent(value: bigint, max: bigint): number {
  if (max <= 0n || value <= 0n) return 0;
  return Math.max(2, Number((value * 1000n) / max) / 10);
}

export function csvCell(v: string | number): string {
  const s = String(v);
  // Guard against formulas when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
