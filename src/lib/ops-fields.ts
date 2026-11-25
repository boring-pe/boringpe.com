// Pure description and validation of Operations records. No database access, so it can be tested alone.

export const PILLARS = [
  { id: "build", label: "Build" },
  { id: "own", label: "Own" },
  { id: "co_build", label: "Co-Build" },
  { id: "enable", label: "Boring Stack" },
] as const;

/**
 * Boring PE's four verticals, in the order the portal shows them. Boring Stack (Enable, id
 * "enable") manages all of Boring PE's activities, including Build, Co-Build and Own.
 */
export const VERTICALS = [
  { id: "build", slug: "build", label: "Build", note: "Businesses Boring PE builds on its own, run by operators on revenue or profit share." },
  { id: "co_build", slug: "co-build", label: "Co-Build", note: "Businesses built with partners and operators; an SPV only when equity is shared." },
  { id: "own", slug: "own", label: "Own", note: "Businesses and stakes Boring PE owns: holdings, valuations and exits." },
  { id: "enable", slug: "stack", label: "Boring Stack", note: "Enable: manages all of Boring PE's activities, Build, Co-Build and Own, and the portal and business operations behind them." },
] as const;
export type Vertical = (typeof VERTICALS)[number]["id"];
export const isVertical = (v: unknown): v is Vertical => VERTICALS.some((x) => x.id === v);
export const verticalLabel = (id: string | null | undefined) => VERTICALS.find((v) => v.id === id)?.label ?? "—";
export const verticalBySlug = (slug: string) => VERTICALS.find((v) => v.slug === slug) ?? null;
export type Pillar = (typeof PILLARS)[number]["id"];

export const STAGES = [
  { id: "sourcing", label: "Sourcing" },
  { id: "diligence", label: "Diligence" },
  { id: "term_sheet", label: "Term sheet" },
  { id: "closing", label: "Closing" },
  { id: "closed", label: "Closed" },
  { id: "passed", label: "Passed" },
] as const;
export type Stage = (typeof STAGES)[number]["id"];

/** Moves into these stages need the Super Admin unless the Super Admin makes them. */
export const GATED_STAGES: readonly Stage[] = ["closing", "closed"];

export const PARTY_KINDS = ["company", "person", "fund", "vendor"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export const CATEGORIES = [
  { id: "investment", label: "Investment" },
  { id: "fee", label: "Fee" },
  { id: "expense", label: "Expense" },
  { id: "payout", label: "Payout" },
  { id: "salary", label: "Salary" },
  { id: "other", label: "Other" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];

export const MAX_AMOUNT = 1_000_000_000_000; // one lakh crore rupees

export const isPillar = (v: unknown): v is Pillar => PILLARS.some((p) => p.id === v);
export const isStage = (v: unknown): v is Stage => STAGES.some((s) => s.id === v);
export const isCategory = (v: unknown): v is Category => CATEGORIES.some((c) => c.id === v);
export const isPartyKind = (v: unknown): v is PartyKind => (PARTY_KINDS as readonly string[]).includes(v as string);

export const pillarLabel = (id: string) => PILLARS.find((p) => p.id === id)?.label ?? id;
export const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Accepts "1,50,000", "1500000.5" and the like. Returns a string with two decimals, or null. */
export function parseAmount(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[,\s₹]/g, "");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (!(n > 0) || n > MAX_AMOUNT) return null;
  return n.toFixed(2);
}

/** Optional amount: empty means none. */
export function parseOptionalAmount(raw: unknown): string | null | "bad" {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (/^[0.,\s₹]+$/.test(raw)) return "0.00";
  return parseAmount(raw) ?? "bad";
}

export function parseDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : raw;
}

export function oneLine(raw: unknown, max: number): string {
  return (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function inr(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
}
