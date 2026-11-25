// Pure venture maths in paise: percentages, the Boring Stack fee and operator shares.

/** "12.5" or "12.5%" to basis points (1250). Up to two decimals, 0 to 100. Null if invalid. */
export function parsePercent(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[%\s]/g, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const bps = Number(w) * 100 + Number((f + "00").slice(0, 2));
  return bps <= 10000 ? bps : null;
}

export const bpsLabel = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/** amount × bps / 10000, rounded to the nearest paisa (halves up). */
export function applyBps(amount: bigint, bps: number): bigint {
  if (amount <= 0n || bps <= 0) return 0n;
  return (amount * BigInt(bps) + 5000n) / 10000n;
}

export type FeeRule = { type: "none" | "fixed" | "percent"; fixed: bigint; bps: number };

export function feeFor(rule: FeeRule, revenue: bigint): bigint {
  if (rule.type === "fixed") return rule.fixed;
  if (rule.type === "percent") return applyBps(revenue, rule.bps);
  return 0n;
}

export type OperatorTerm = { id: string; basis: "revenue" | "profit"; bps: number };

/**
 * One month: profit after costs and the fee, then each operator's share of revenue or of
 * profit (never of a loss), and what is left for the venture.
 */
export function statement(revenue: bigint, costs: bigint, fee: bigint, operators: OperatorTerm[]) {
  const profit = revenue - costs - fee;
  const shares = operators.map((o) => ({
    id: o.id,
    amount: applyBps(o.basis === "revenue" ? revenue : profit > 0n ? profit : 0n, o.bps),
  }));
  const operatorTotal = shares.reduce((s, x) => s + x.amount, 0n);
  return { profit, shares, operatorTotal, net: profit - operatorTotal };
}

/** Shares on the same basis cannot add up to more than 100%. */
export function sharesFit(existing: OperatorTerm[], next: OperatorTerm): boolean {
  return existing.filter((o) => o.basis === next.basis).reduce((s, o) => s + o.bps, 0) + next.bps <= 10000;
}

/** "2026-10" to "2026-10-01"; null if not a month. */
export function parseMonth(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  return `${raw}-01`;
}

/** Last day of the month that starts on `first`. */
export function monthEnd(first: string): string {
  const [y, m] = first.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}
