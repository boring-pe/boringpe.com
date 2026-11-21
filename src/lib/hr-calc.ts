// Pure HR maths: calendar days, leave balances, and one month's payslip in paise.
// Kept free of imports so the test runner can load it directly.

/** amount × bps / 10000, rounded to the nearest paisa (halves up). */
function applyBps(amount: bigint, bps: number): bigint {
  if (amount <= 0n || bps <= 0) return 0n;
  return (amount * BigInt(bps) + 5000n) / 10000n;
}

export const LEAVE_KINDS = [
  { id: "casual", label: "Casual leave", allowance: 12 },
  { id: "sick", label: "Sick leave", allowance: 12 },
  { id: "earned", label: "Earned leave", allowance: 15 },
  { id: "unpaid", label: "Unpaid leave", allowance: null },
] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number]["id"];
export const isLeaveKind = (v: unknown): v is LeaveKind => LEAVE_KINDS.some((k) => k.id === v);
export const leaveLabel = (id: string) => LEAVE_KINDS.find((k) => k.id === id)?.label ?? id;

export const EMPLOYMENT_TYPES = [
  { id: "full_time", label: "Full time" },
  { id: "part_time", label: "Part time" },
  { id: "contract", label: "Contract" },
  { id: "intern", label: "Intern" },
  { id: "consultant", label: "Consultant" },
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["id"];
export const isEmploymentType = (v: unknown): v is EmploymentType => EMPLOYMENT_TYPES.some((t) => t.id === v);
export const employmentLabel = (id: string) => EMPLOYMENT_TYPES.find((t) => t.id === id)?.label ?? id;

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Calendar days from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): number {
  return Math.round((ms(to) - ms(from)) / DAY) + 1;
}

export function daysInMonth(first: string): number {
  const [y, m] = first.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Days of [from, to] that fall in the month starting `first`. */
export function overlapDays(from: string, to: string, first: string): number {
  const start = Math.max(ms(from), ms(first));
  const end = Math.min(ms(to), ms(first) + (daysInMonth(first) - 1) * DAY);
  return end < start ? 0 : Math.round((end - start) / DAY) + 1;
}

/** Indian financial year (April to March) containing `date`, as [from, to]. */
export function fiscalYearOf(date: string): [string, string] {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return [`${start}-04-01`, `${start + 1}-03-31`];
}

export function rangesOverlap(a: [string, string], b: [string, string]) {
  return a[0] <= b[1] && b[0] <= a[1];
}

export type PayInput = {
  monthlyGross: bigint;
  tdsBps: number;
  otherDeduction: bigint;
  joinDate: string;
  exitDate: string | null;
  lopDays: number;
};

/**
 * One month's payslip. Pay is for days employed in the month less unpaid leave, pro rata to
 * calendar days. TDS is a percentage of gross; the fixed deduction never takes net below zero.
 */
export function payslip(p: PayInput, first: string) {
  const dim = daysInMonth(first);
  const monthEnd = iso(ms(first) + (dim - 1) * DAY);
  const employed = overlapDays(p.joinDate, p.exitDate ?? monthEnd, first);
  const lop = Math.min(p.lopDays, employed);
  const payable = employed - lop;
  const gross = payable === dim ? p.monthlyGross : (p.monthlyGross * BigInt(payable) * 2n + BigInt(dim)) / (2n * BigInt(dim));
  const tds = applyBps(gross, p.tdsBps);
  const other = payable > 0 ? (p.otherDeduction < gross - tds ? p.otherDeduction : gross - tds) : 0n;
  return { daysInMonth: dim, employed, lopDays: lop, payableDays: payable, gross, tds, other, net: gross - tds - other };
}
