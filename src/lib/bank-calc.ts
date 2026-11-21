// Pure bank statement parsing and matching, in paise. Kept free of imports so tests load it directly.

/** Splits CSV text into rows, honouring quotes, doubled quotes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Indian bank dates: 21/11/2026, 21-11-26, 21-Nov-2026, 21 Nov 2026, 2026-11-21. */
export function parseBankDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  let x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = t.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/-](\d{2,4})$/))) [d, m, y] = [Number(x[1]), MONTHS[x[2].toLowerCase()] ?? 0, Number(x[3])];
  else return null;
  if (y < 100) y += 2000;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !isNaN(dt.getTime()) && dt.getUTCDate() === d && dt.getUTCMonth() + 1 === m ? iso : null;
}

/** "1,23,456.78", "(500.00)", "500.00 Dr", "-500" to paise; blank is null. */
export function parseBankAmount(raw: string): bigint | null {
  let t = raw.replace(/[₹,\s]/g, "").replace(/^INR/i, "");
  if (t === "" || t === "-") return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/dr$/i.test(t)) { neg = true; t = t.slice(0, -2); } else if (/cr$/i.test(t)) t = t.slice(0, -2);
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const v = BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

export type StatementLine = { date: string; description: string; ref: string; amount: bigint; balance: bigint | null };

const find = (headers: string[], names: RegExp) => headers.findIndex((h) => names.test(h.toLowerCase()));

/**
 * Finds the header row (banks put a preamble above it) and reads every transaction.
 * Deposits are positive, withdrawals negative. Rows without a valid date are skipped.
 */
export function readStatement(text: string): { lines: StatementLine[]; skipped: number } | { error: string } {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => {
    const h = r.map((x) => x.toLowerCase());
    const hasDate = h.some((x) => /date/.test(x));
    const hasMoney = h.some((x) => /withdraw|debit|deposit|credit|amount/.test(x));
    return hasDate && hasMoney;
  });
  if (headerAt < 0) return { error: "No header row with a date and amounts was found." };
  const h = rows[headerAt];
  const iDate = (() => { const a = find(h, /^(txn |transaction |tran )?date$|^date|posting date|txn date|transaction date/); return a >= 0 ? a : find(h, /date/); })();
  const iDesc = find(h, /narration|description|particulars|remarks|details/);
  const iRef = find(h, /ref|chq|cheque|utr/);
  const iDebit = find(h, /withdraw|debit|dr\b/);
  const iCredit = find(h, /deposit|credit|cr\b/);
  const iAmount = find(h, /^amount|amount \(inr\)|txn amount|transaction amount/);
  const iBal = find(h, /balance/);
  if (iDate < 0 || (iAmount < 0 && (iDebit < 0 || iCredit < 0))) return { error: "Could not tell which columns hold the date and the amounts." };
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerAt + 1)) {
    const date = parseBankDate(r[iDate] ?? "");
    if (!date) { skipped += 1; continue; }
    let amount: bigint | null;
    if (iDebit >= 0 && iCredit >= 0) {
      const dr = parseBankAmount(r[iDebit] ?? "") ?? 0n;
      const cr = parseBankAmount(r[iCredit] ?? "") ?? 0n;
      amount = (cr < 0n ? -cr : cr) - (dr < 0n ? -dr : dr);
    } else amount = parseBankAmount(r[iAmount] ?? "");
    if (amount === null || amount === 0n) { skipped += 1; continue; }
    lines.push({
      date, amount,
      description: (r[iDesc] ?? "").slice(0, 300),
      ref: iRef >= 0 && iRef !== iDesc ? (r[iRef] ?? "").slice(0, 80) : "",
      balance: iBal >= 0 ? parseBankAmount(r[iBal] ?? "") : null,
    });
  }
  return { lines, skipped };
}

/** A stable fingerprint so the same line imported twice is recognised. */
export function lineKey(l: Pick<StatementLine, "date" | "amount" | "description" | "ref" | "balance">, occurrence: number): string {
  return [l.date, l.amount.toString(), l.description.toLowerCase().replace(/\s+/g, " "), l.ref, l.balance?.toString() ?? "", occurrence].join("|");
}

export type BookLine = { id: string; date: string; amount: bigint }; // + for bank debits (money in)
export type BankItem = { id: string; date: string; amount: bigint };

const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Pairs statement lines with book lines of the same amount within `window` days, closest dates first.
 * Each book line is used once. Lines with no unique best partner stay unmatched for a person to decide.
 */
export function autoMatch(bank: BankItem[], book: BookLine[], window = 7): { bankId: string; bookId: string }[] {
  const candidates: { bankId: string; bookId: string; gap: number }[] = [];
  for (const b of bank) for (const k of book) {
    if (k.amount === b.amount && days(b.date, k.date) <= window) candidates.push({ bankId: b.id, bookId: k.id, gap: days(b.date, k.date) });
  }
  candidates.sort((x, y) => x.gap - y.gap || x.bankId.localeCompare(y.bankId) || x.bookId.localeCompare(y.bookId));
  const usedBank = new Set<string>(), usedBook = new Set<string>();
  const out: { bankId: string; bookId: string }[] = [];
  for (const c of candidates) {
    if (usedBank.has(c.bankId) || usedBook.has(c.bookId)) continue;
    // Skip ties: two equally close book lines for one statement line need a person.
    const tie = candidates.some((o) => o !== c && o.bankId === c.bankId && o.gap === c.gap && !usedBook.has(o.bookId));
    if (tie) continue;
    usedBank.add(c.bankId); usedBook.add(c.bookId);
    out.push({ bankId: c.bankId, bookId: c.bookId });
  }
  return out;
}
