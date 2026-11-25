// Pure date maths for the dashboard's period picker. No imports, so the test runner can load it directly.
// Dates are "YYYY-MM-DD" strings in India time; financial years run April to March.

export type Period = "month" | "last_month" | "quarter" | "fy" | "last_fy" | "12m";
export type Bucket = "day" | "month";

export const PERIODS: { value: Period; label: string; short: string }[] = [
  { value: "month", label: "This month", short: "Month" },
  { value: "last_month", label: "Last month", short: "Last month" },
  { value: "quarter", label: "This quarter", short: "Quarter" },
  { value: "fy", label: "This financial year", short: "FY" },
  { value: "last_fy", label: "Last financial year", short: "Last FY" },
  { value: "12m", label: "Last 12 months", short: "12 months" },
];
export const DEFAULT_PERIOD: Period = "fy";

export function parsePeriod(v: string | null | undefined): Period {
  return PERIODS.some((p) => p.value === v) ? (v as Period) : DEFAULT_PERIOD;
}

export type Range = {
  period: Period;
  from: string;
  to: string;
  /** The span this one is compared with: the same length one period earlier. */
  prevFrom: string;
  prevTo: string;
  bucket: Bucket;
  /** "vs last year", "vs last month"… for the change under a figure. */
  compare: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The same day `n` months away, held to the last day of a shorter month (31 Mar − 1 → 28/29 Feb). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysIn(ny, nm)));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const monthEnd = (date: string) => { const [y, m] = parts(date); return ymd(y, m, daysIn(y, m)); };
const fyStart = (date: string) => { const [y, m] = parts(date); return ymd(m >= 4 ? y : y - 1, 4, 1); };
/** Financial-year quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar. */
const quarterStart = (date: string) => { const [y, m] = parts(date); const q = Math.floor(((m + 8) % 12) / 3); return addMonths(fyStart(date), q * 3); };

/** Today in India, whatever the server's clock zone. */
export function todayIST(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The dates a period covers, and the span it is compared with. A period still running ("This
 * month", "This financial year") stops at today and is compared with the same number of days one
 * period earlier, so half a month is never measured against a whole one.
 */
export function periodRange(period: Period, today: string): Range {
  const so = (from: string, back: number, compare: string, bucket: Bucket): Range => {
    const span = daysBetween(from, today);
    const prevFrom = addMonths(from, -back);
    // Held inside the earlier period: 31 March so far is compared with all of February, not 3 March.
    const end = addDays(prevFrom, span), last = addDays(from, -1);
    return { period, from, to: today, prevFrom, prevTo: end < last ? end : last, bucket, compare };
  };
  const whole = (from: string, to: string, back: number, compare: string, bucket: Bucket): Range =>
    ({ period, from, to, prevFrom: addMonths(from, -back), prevTo: addDays(addMonths(addDays(to, 1), -back), -1), bucket, compare });
  switch (period) {
    case "month": return so(monthStart(today), 1, "vs same days last month", "day");
    case "last_month": { const from = addMonths(monthStart(today), -1); return whole(from, monthEnd(from), 1, "vs the month before", "day"); }
    case "quarter": return so(quarterStart(today), 3, "vs same days last quarter", "month");
    case "last_fy": { const from = addMonths(fyStart(today), -12); return whole(from, addDays(fyStart(today), -1), 12, "vs the year before", "month"); }
    case "12m": { const from = addMonths(monthStart(today), -11); return whole(from, monthEnd(today), 12, "vs the 12 months before", "month"); }
    default: return so(fyStart(today), 12, "vs same days last year", "month");
  }
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Each bucket's key ("YYYY-MM-DD" or "YYYY-MM") from `from` to `to`, in order. */
export function bucketKeys(from: string, to: string, bucket: Bucket): string[] {
  const out: string[] = [];
  if (bucket === "day") {
    for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  } else {
    for (let d = monthStart(from); d <= to && out.length < 120; d = addMonths(d, 1)) out.push(d.slice(0, 7));
  }
  return out;
}

/** The first and last date a bucket covers, held inside the range, for "open this month's report". */
export function bucketSpan(key: string, from: string, to: string): [string, string] {
  if (key.length === 10) return [key, key];
  const s = `${key}-01`, e = monthEnd(s);
  return [s < from ? from : s, e > to ? to : e];
}

/** A short label for a bucket: "Apr" for a month, "14" for a day. */
export function bucketLabel(key: string): string {
  if (key.length === 10) return String(Number(key.slice(8)));
  return new Date(`${key}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
}

/** "1 Apr – 25 Nov 2026", in Indian order. */
export function rangeLabel(from: string, to: string): string {
  const f = (s: string, year: boolean) => new Date(`${s}T00:00:00Z`).toLocaleString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${f(from, from.slice(0, 4) !== to.slice(0, 4))} – ${f(to, true)}`;
}

/** Percent change, one decimal, or null when there is nothing to compare with. */
export function pctChange(now: bigint, before: bigint): number | null {
  if (before === 0n) return null;
  const sign = before < 0n ? -1n : 1n;
  return Number(((now - before) * 1000n * sign) / before) / 10;
}
