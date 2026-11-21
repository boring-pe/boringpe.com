// Pure accounting rules: amounts in paise (bigint), journal validation, trial balance, P&L, balance sheet.
// No database access, so it can be tested alone.

export const ACCOUNT_TYPES = [
  { id: "asset", label: "Asset" },
  { id: "liability", label: "Liability" },
  { id: "equity", label: "Equity" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expense" },
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number]["id"];
export const isAccountType = (v: unknown): v is AccountType => ACCOUNT_TYPES.some((t) => t.id === v);

/** Assets and expenses grow with debits; the rest grow with credits. */
export const NORMAL_SIDE: Record<AccountType, "debit" | "credit"> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  income: "credit",
};

export const ENTITY_KINDS = [
  { id: "boring_pe", label: "Boring PE" },
  { id: "spv", label: "SPV" },
  { id: "venture", label: "Venture" },
  { id: "impact_marrow", label: "Impact Marrow" },
  { id: "fund", label: "Fund" },
  { id: "other", label: "Other" },
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number]["id"];
export const isEntityKind = (v: unknown): v is EntityKind => ENTITY_KINDS.some((k) => k.id === v);
export const entityKindLabel = (id: string) => ENTITY_KINDS.find((k) => k.id === id)?.label ?? id;

export type ChartSeed = { code: string; name: string; type: AccountType };

/** Every new entity starts with this chart. It can be extended per entity. */
export const DEFAULT_CHART: ChartSeed[] = [
  { code: "1010", name: "Bank", type: "asset" },
  { code: "1020", name: "Cash", type: "asset" },
  { code: "1100", name: "Receivables", type: "asset" },
  { code: "1200", name: "Investments", type: "asset" },
  { code: "1300", name: "Loans and advances", type: "asset" },
  { code: "1400", name: "GST input credit", type: "asset" },
  { code: "1500", name: "TDS receivable", type: "asset" },
  { code: "2010", name: "Payables", type: "liability" },
  { code: "2100", name: "GST payable", type: "liability" },
  { code: "2200", name: "TDS payable", type: "liability" },
  { code: "2300", name: "Salaries payable", type: "liability" },
  { code: "2900", name: "Loans taken", type: "liability" },
  { code: "3010", name: "Capital", type: "equity" },
  { code: "3200", name: "Owner drawings", type: "equity" },
  { code: "4010", name: "Management fees", type: "income" },
  { code: "4020", name: "Commission and profit share", type: "income" },
  { code: "4030", name: "Investment income", type: "income" },
  { code: "4040", name: "Venture revenue", type: "income" },
  { code: "4900", name: "Other income", type: "income" },
  { code: "5010", name: "Salaries", type: "expense" },
  { code: "5020", name: "Professional fees", type: "expense" },
  { code: "5030", name: "Rent", type: "expense" },
  { code: "5040", name: "Software and tools", type: "expense" },
  { code: "5050", name: "Travel", type: "expense" },
  { code: "5060", name: "Marketing", type: "expense" },
  { code: "5070", name: "Bank charges", type: "expense" },
  { code: "5080", name: "Operator revenue share", type: "expense" },
  { code: "5090", name: "Impact contributions", type: "expense" },
  { code: "5100", name: "Business House fee", type: "expense" },
  { code: "5900", name: "Other expenses", type: "expense" },
];

// ---- amounts

export const MAX_PAISE = 100_000_000_000_000n; // one lakh crore rupees

/** "1,50,000.50" to paise. Empty is zero. Anything else invalid is null. */
export function parsePaise(raw: unknown): bigint | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[,\s₹]/g, "");
  if (text === "") return 0n;
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const value = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return value > MAX_PAISE ? null : value;
}

/** Paise to a plain decimal string for the database, e.g. 15050n to "150.50". */
export function paiseToDecimal(p: bigint): string {
  const sign = p < 0n ? "-" : "";
  const a = p < 0n ? -p : p;
  return `${sign}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

export function rupees(p: bigint): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    Number(p) / 100,
  );
}

// ---- journal

export type LineInput = { accountId: string; debit: string; credit: string };
export type Line = { accountId: string; debit: bigint; credit: bigint };

/** Blank rows are skipped. Returns the cleaned lines, or the reasons it cannot be posted. */
export function validateJournal(input: LineInput[]): { lines: Line[]; errors: string[] } {
  const errors: string[] = [];
  const lines: Line[] = [];
  for (const [i, row] of input.entries()) {
    const debit = parsePaise(row.debit);
    const credit = parsePaise(row.credit);
    const blank = !row.accountId && (debit === 0n || debit === null) && (credit === 0n || credit === null) &&
      row.debit.trim() === "" && row.credit.trim() === "";
    if (blank) continue;
    const n = i + 1;
    if (debit === null || credit === null) {
      errors.push(`Line ${n}: the amount is not valid.`);
      continue;
    }
    if (!row.accountId) {
      errors.push(`Line ${n}: choose an account.`);
      continue;
    }
    if (debit > 0n && credit > 0n) {
      errors.push(`Line ${n}: use debit or credit, not both.`);
      continue;
    }
    if (debit === 0n && credit === 0n) {
      errors.push(`Line ${n}: enter an amount.`);
      continue;
    }
    lines.push({ accountId: row.accountId, debit, credit });
  }
  if (errors.length === 0) {
    if (lines.length < 2) errors.push("An entry needs at least two lines.");
    const d = lines.reduce((s, l) => s + l.debit, 0n);
    const c = lines.reduce((s, l) => s + l.credit, 0n);
    if (d !== c) errors.push(`Debits ${rupees(d)} and credits ${rupees(c)} must be equal.`);
  }
  return { lines, errors };
}

// ---- reports

export type BalanceRow = { id: string; code: string; name: string; type: AccountType; debit: bigint; credit: bigint };

/** The balance on the account's own side: positive means it is in its normal direction. */
export function balanceOf(row: Pick<BalanceRow, "type" | "debit" | "credit">): bigint {
  return NORMAL_SIDE[row.type] === "debit" ? row.debit - row.credit : row.credit - row.debit;
}

export function trialBalance(rows: BalanceRow[]) {
  const lines = rows
    .map((r) => ({ ...r, net: r.debit - r.credit }))
    .filter((r) => r.net !== 0n)
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      debit: r.net > 0n ? r.net : 0n,
      credit: r.net < 0n ? -r.net : 0n,
    }));
  const debit = lines.reduce((s, l) => s + l.debit, 0n);
  const credit = lines.reduce((s, l) => s + l.credit, 0n);
  return { lines, debit, credit, balanced: debit === credit };
}

function section(rows: BalanceRow[], type: AccountType) {
  const lines = rows
    .filter((r) => r.type === type)
    .map((r) => ({ id: r.id, code: r.code, name: r.name, amount: balanceOf(r) }))
    .filter((l) => l.amount !== 0n);
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0n) };
}

export function profitAndLoss(rows: BalanceRow[]) {
  const income = section(rows, "income");
  const expense = section(rows, "expense");
  return { income, expense, net: income.total - expense.total };
}

export function balanceSheet(rows: BalanceRow[]) {
  const assets = section(rows, "asset");
  const liabilities = section(rows, "liability");
  const equity = section(rows, "equity");
  const { net } = profitAndLoss(rows);
  const rightSide = liabilities.total + equity.total + net;
  return { assets, liabilities, equity, earnings: net, rightSide, balanced: assets.total === rightSide };
}
