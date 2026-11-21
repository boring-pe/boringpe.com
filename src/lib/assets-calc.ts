// Pure fixed-asset depreciation, budgets and currency conversion, in paise. No imports, so tests load it directly.

export const ASSET_CATEGORIES = [
  { id: "computers", label: "Computers and IT", wdvBps: 4000, lifeMonths: 36 },
  { id: "furniture", label: "Furniture and fittings", wdvBps: 1000, lifeMonths: 120 },
  { id: "vehicles", label: "Vehicles", wdvBps: 1500, lifeMonths: 96 },
  { id: "plant", label: "Plant and machinery", wdvBps: 1500, lifeMonths: 180 },
  { id: "office", label: "Office equipment", wdvBps: 1500, lifeMonths: 60 },
  { id: "buildings", label: "Buildings", wdvBps: 1000, lifeMonths: 360 },
  { id: "intangibles", label: "Software and intangibles", wdvBps: 2500, lifeMonths: 60 },
  { id: "other", label: "Other", wdvBps: 1500, lifeMonths: 60 },
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]["id"];
export const isAssetCategory = (v: unknown): v is AssetCategory => ASSET_CATEGORIES.some((c) => c.id === v);
export const assetCategoryLabel = (id: string) => ASSET_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export type AssetTerms = {
  cost: bigint; salvage: bigint; method: "slm" | "wdv"; lifeMonths: number; wdvBps: number; purchaseDate: string;
};

const dim = (first: string) => { const [y, m] = first.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/**
 * One month's depreciation. Straight line spreads cost less salvage evenly over the useful life;
 * written-down value charges the yearly rate on the remaining value, a twelfth each month.
 * The month of purchase is charged for the days owned. Never takes the value below salvage.
 */
export function monthlyDepreciation(a: AssetTerms, monthFirst: string, accumulated: bigint): bigint {
  const purchaseMonth = a.purchaseDate.slice(0, 7) + "-01";
  if (monthFirst < purchaseMonth) return 0n;
  const remaining = a.cost - a.salvage - accumulated;
  if (remaining <= 0n) return 0n;
  let full: bigint;
  if (a.method === "slm") {
    if (a.lifeMonths <= 0) return 0n;
    full = ((a.cost - a.salvage) * 2n + BigInt(a.lifeMonths)) / (2n * BigInt(a.lifeMonths));
  } else {
    const book = a.cost - accumulated;
    full = (book * BigInt(a.wdvBps) + 60_000n) / 120_000n;
  }
  if (monthFirst === purchaseMonth) {
    const days = dim(monthFirst) - Number(a.purchaseDate.slice(8, 10)) + 1;
    full = (full * BigInt(days) * 2n + BigInt(dim(monthFirst))) / (2n * BigInt(dim(monthFirst)));
  }
  return full < remaining ? full : remaining;
}

/** On sale or scrapping: book value, and the gain (positive) or loss (negative) on the proceeds. */
export function disposal(cost: bigint, accumulated: bigint, proceeds: bigint) {
  const book = cost - accumulated;
  return { book, gain: proceeds - book };
}

/** An annual budget spread evenly over twelve months; leftover paise go to the last month. */
export function spreadAnnual(annual: bigint): bigint[] {
  const each = annual / 12n;
  return Array.from({ length: 12 }, (_, i) => (i === 11 ? annual - each * 11n : each));
}

/** The twelve month starts of the financial year beginning in April of `startYear`. */
export function fyMonths(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    const y = i < 9 ? startYear : startYear + 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  });
}

// ---- currencies

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (v: unknown): v is Currency => (CURRENCIES as readonly string[]).includes(v as string);

/** Exchange rate as rupees per unit, up to 6 decimals, stored in millionths. */
export function parseRate(raw: string): bigint | null {
  const t = raw.replace(/,/g, "").trim();
  if (!/^\d{1,7}(\.\d{1,6})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const v = BigInt(w) * 1_000_000n + BigInt((f + "000000").slice(0, 6));
  return v > 0n ? v : null;
}

/** Foreign amount in cents (hundredths) × rate in millionths → rupees in paise, rounded half up. */
export function toInr(foreignCents: bigint, rateMicro: bigint): bigint {
  const neg = foreignCents < 0n;
  const a = neg ? -foreignCents : foreignCents;
  const v = (a * rateMicro + 500_000n) / 1_000_000n;
  return neg ? -v : v;
}

export const rateText = (rateMicro: bigint) => {
  const w = rateMicro / 1_000_000n;
  const f = (rateMicro % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
};

/**
 * Converts the lines of a balanced foreign-currency entry to rupees. Rounding each line can leave a
 * paisa or two of difference; it is put on the largest line of the lighter side so the entry balances.
 */
export function convertLines<T extends { debit: bigint; credit: bigint }>(lines: T[], rateMicro: bigint): T[] {
  const out = lines.map((l) => ({ ...l, debit: toInr(l.debit, rateMicro), credit: toInr(l.credit, rateMicro) }));
  const d = out.reduce((s, l) => s + l.debit, 0n);
  const c = out.reduce((s, l) => s + l.credit, 0n);
  if (d !== c) {
    const side: "debit" | "credit" = d < c ? "debit" : "credit";
    let best = -1;
    out.forEach((l, i) => { if (l[side] > 0n && (best < 0 || l[side] > out[best][side])) best = i; });
    if (best >= 0) out[best] = { ...out[best], [side]: out[best][side] + (d < c ? c - d : d - c) };
  }
  return out;
}
