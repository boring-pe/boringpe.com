// Pure invoicing and GST rules in paise. Kept free of imports so tests load it directly.

export const GST_RATES = [0, 500, 1200, 1800, 2800] as const; // basis points

export const STATES: { code: string; name: string }[] = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"], ["05", "Uttarakhand"],
  ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"],
  ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"],
  ["24", "Gujarat"], ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"], ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"], ["97", "Other Territory"],
].map(([code, name]) => ({ code, name }));
export const isStateCode = (v: unknown): v is string => typeof v === "string" && STATES.some((s) => s.code === v);
export const stateName = (code: string | null) => STATES.find((s) => s.code === code)?.name ?? "";

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A GSTIN: state code, PAN, entity number, Z, and a check character that must match. */
export function validGstin(raw: string): boolean {
  const g = raw.toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g) || !isStateCode(g.slice(0, 2))) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/** Quantity (up to 3 decimals) × rate in paise, rounded to the paisa. */
export function lineAmount(qtyMilli: bigint, rate: bigint): bigint {
  return (qtyMilli * rate + 500n) / 1000n;
}

export function parseQty(raw: string): bigint | null {
  const t = raw.replace(/,/g, "").trim() || "1";
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const v = BigInt(w) * 1000n + BigInt((f + "000").slice(0, 3));
  return v > 0n ? v : null;
}

const bps = (amount: bigint, rate: number) => (amount * BigInt(rate) + 5000n) / 10000n;

export type InvoiceLine = { qtyMilli: bigint; rate: bigint; gstBps: number };

/**
 * Totals for an invoice. Within the seller's state the tax is CGST plus SGST, split in half
 * (an odd paisa goes to CGST); across states it is IGST. Tax is worked out per line.
 */
export function invoiceTotals(lines: InvoiceLine[], intraState: boolean) {
  let subtotal = 0n, tax = 0n;
  const perLine = lines.map((l) => {
    const amount = lineAmount(l.qtyMilli, l.rate);
    const t = bps(amount, l.gstBps);
    subtotal += amount;
    tax += t;
    return { amount, tax: t };
  });
  const cgst = intraState ? tax - tax / 2n : 0n;
  const sgst = intraState ? tax / 2n : 0n;
  const igst = intraState ? 0n : tax;
  return { perLine, subtotal, cgst, sgst, igst, tax, total: subtotal + tax };
}

/** "INV/2026-27/0007" for the financial year of `issueDate`. */
export function invoiceNumber(prefix: string, issueDate: string, seq: number): string {
  const [y, m] = issueDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${prefix}/${start}-${String((start + 1) % 100).padStart(2, "0")}/${String(seq).padStart(4, "0")}`;
}

export const AGEING = ["Not due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

/** Which ageing bucket an unpaid invoice falls in, by days past its due date. */
export function ageingBucket(dueDate: string, today: string): number {
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 0;
  if (days <= 30) return 1;
  if (days <= 60) return 2;
  if (days <= 90) return 3;
  return 4;
}
