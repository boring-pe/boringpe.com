// Pure portfolio maths in paise. No database access, so it can be tested alone.

export const ASSET_CLASSES = [
  { id: "private_equity", label: "Private equity" },
  { id: "startup", label: "Startup" },
  { id: "business", label: "Business (bought)" },
  { id: "listed_equity", label: "Listed equity" },
  { id: "debt", label: "Debt" },
  { id: "real_estate", label: "Real estate" },
  { id: "fund", label: "Fund" },
  { id: "gold", label: "Gold" },
  { id: "other", label: "Other" },
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number]["id"];
export const isAssetClass = (v: unknown): v is AssetClass => ASSET_CLASSES.some((a) => a.id === v);
export const assetClassLabel = (id: string) => ASSET_CLASSES.find((a) => a.id === id)?.label ?? id;

export const HOLDING_PILLARS = ["build", "own", "co_build"] as const;
export type HoldingPillar = (typeof HOLDING_PILLARS)[number];
export const isHoldingPillar = (v: unknown): v is HoldingPillar => (HOLDING_PILLARS as readonly string[]).includes(v as string);

export const INSTRUMENTS = [
  { id: "equity", label: "Equity" },
  { id: "preference", label: "Preference shares" },
  { id: "convertible", label: "Convertible" },
  { id: "safe", label: "SAFE / iSAFE" },
  { id: "sweat", label: "Sweat equity" },
  { id: "esop", label: "ESOP pool" },
] as const;
export type Instrument = (typeof INSTRUMENTS)[number]["id"];
export const isInstrument = (v: unknown): v is Instrument => INSTRUMENTS.some((i) => i.id === v);
export const instrumentLabel = (id: string) => INSTRUMENTS.find((i) => i.id === id)?.label ?? id;

export type TxnKind = "invest" | "income" | "exit" | "valuation";
export type Txn = { kind: TxnKind; date: string; amount: bigint; costRecovered: bigint };

export type Position = {
  invested: bigint;
  costRemaining: bigint;
  proceeds: bigint;
  realizedGain: bigint;
  income: bigint;
  /** Latest valuation after the last investment or exit; otherwise the remaining cost. */
  currentValue: bigint;
  valuedOn: string | null;
  unrealizedGain: bigint;
  /** Everything returned plus what is still held, over what was put in. Null before any investment. */
  moic: number | null;
};

export function position(txns: Txn[]): Position {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  let invested = 0n, recovered = 0n, proceeds = 0n, income = 0n;
  let mark: { value: bigint; date: string } | null = null;
  for (const t of sorted) {
    if (t.kind === "invest") { invested += t.amount; mark = null; }
    else if (t.kind === "exit") { proceeds += t.amount; recovered += t.costRecovered; mark = null; }
    else if (t.kind === "income") income += t.amount;
    else mark = { value: t.amount, date: t.date };
  }
  const costRemaining = invested - recovered;
  const currentValue = mark ? mark.value : costRemaining;
  const total = currentValue + proceeds + income;
  return {
    invested,
    costRemaining,
    proceeds,
    realizedGain: proceeds - recovered,
    income,
    currentValue,
    valuedOn: mark?.date ?? null,
    unrealizedGain: currentValue - costRemaining,
    moic: invested > 0n ? Number((total * 10000n) / invested) / 10000 : null,
  };
}

/** Whether an exit may recover this much cost: never more than is still held. */
export function exitAllowed(txns: Txn[], costRecovered: bigint): boolean {
  return costRecovered >= 0n && costRecovered <= position(txns).costRemaining;
}

export type CapRow = { holder: string; shares: number; invested: bigint };

/** Ownership by holder, merging rows of the same holder, largest first. Percentages add up to 100. */
export function capTable(rows: CapRow[]) {
  const by = new Map<string, { shares: number; invested: bigint }>();
  for (const r of rows) {
    const cur = by.get(r.holder) ?? { shares: 0, invested: 0n };
    by.set(r.holder, { shares: cur.shares + r.shares, invested: cur.invested + r.invested });
  }
  const total = [...by.values()].reduce((s, v) => s + v.shares, 0);
  return {
    total,
    holders: [...by.entries()]
      .map(([holder, v]) => ({ holder, ...v, percent: total > 0 ? (v.shares / total) * 100 : 0 }))
      .sort((a, b) => b.shares - a.shares),
  };
}
