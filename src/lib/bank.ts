import { getSql, type Sql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, ensureCharts, postByCodes } from "./books";
import { autoMatch, lineKey, readStatement } from "./bank-calc";

export type BankLineRow = {
  id: string; txn_date: string; description: string; ref: string; amount: string; balance: string | null;
  status: "unmatched" | "matched" | "posted" | "ignored"; journal_line_id: string | null; matched_memo: string | null; matched_date: string | null;
};
export type Candidate = { id: string; date: string; memo: string; amount: string };

/** Lines in the books on the bank account (1010) not yet tied to a statement line; money in is positive. */
async function openBookLines(db: Sql, entityId: string) {
  return db.query<{ id: string; date: string; memo: string; amount: string }>(
    `select l.id::text, e.entry_date::text as date, e.memo, (l.debit - l.credit)::text as amount
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where a.entity_id = $1 and a.code = '1010'
        and not exists (select 1 from bank_lines b where b.journal_line_id = l.id)`,
    [entityId],
  );
}

async function matchAll(db: Sql, entityId: string, by: string) {
  const bank = await db.query<{ id: string; date: string; amount: string }>(
    "select id, txn_date::text as date, amount::text from bank_lines where entity_id = $1 and status = 'unmatched'",
    [entityId],
  );
  const book = await openBookLines(db, entityId);
  const pairs = autoMatch(
    bank.map((b) => ({ id: b.id, date: b.date, amount: decimalToPaise(b.amount) })),
    book.map((k) => ({ id: k.id, date: k.date, amount: decimalToPaise(k.amount) })),
  );
  for (const p of pairs) {
    await db.query("update bank_lines set status = 'matched', journal_line_id = $2::bigint, decided_by = $3 where id = $1 and status = 'unmatched'", [p.bankId, p.bookId, by]);
  }
  return pairs.length;
}

/** Imports a CSV statement: new lines only (a re-import adds nothing), then matches what it can. */
export async function importStatement(entityId: string, fileName: string, text: string, by: string) {
  const parsed = readStatement(text);
  if ("error" in parsed) return parsed;
  await ensureCharts();
  const sql = await getSql();
  return sql.tx(async (db) => {
    const imp = (await db.query<{ id: string }>(
      "insert into bank_imports (entity_id, file_name, added, duplicates, skipped, imported_by) values ($1, $2, 0, 0, $3, $4) returning id",
      [entityId, fileName, parsed.skipped, by],
    ))[0];
    const seen = new Map<string, number>();
    let added = 0;
    for (const l of parsed.lines) {
      const base = lineKey(l, 0);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const rows = await db.query(
        `insert into bank_lines (entity_id, import_id, line_key, txn_date, description, ref, amount, balance)
         values ($1, $2, $3, $4::date, $5, $6, $7, $8) on conflict (entity_id, line_key) do nothing returning id`,
        [entityId, imp.id, lineKey(l, n), l.date, l.description, l.ref, paiseToDecimal(l.amount), l.balance === null ? null : paiseToDecimal(l.balance)],
      );
      added += rows.length;
    }
    const duplicates = parsed.lines.length - added;
    await db.query("update bank_imports set added = $2, duplicates = $3 where id = $1", [imp.id, added, duplicates]);
    const matched = await matchAll(db, entityId, by);
    return { added, duplicates, skipped: parsed.skipped, matched };
  });
}

export async function rematch(entityId: string, by: string) {
  const sql = await getSql();
  return sql.tx((db) => matchAll(db, entityId, by));
}

export async function listBankLines(entityId: string) {
  const sql = await getSql();
  return sql.query<BankLineRow>(
    `select b.id, b.txn_date::text, b.description, b.ref, b.amount::text, b.balance::text, b.status, b.journal_line_id::text,
            e.memo as matched_memo, e.entry_date::text as matched_date
       from bank_lines b left join journal_lines l on l.id = b.journal_line_id left join journal_entries e on e.id = l.entry_id
      where b.entity_id = $1 order by (b.status = 'unmatched') desc, b.txn_date desc, b.seq desc limit 500`,
    [entityId],
  );
}

/** Book lines a person might match an unmatched statement line to: same amount, within 45 days. */
export async function candidatesFor(entityId: string) {
  const sql = await getSql();
  const book = await openBookLines(sql, entityId);
  return book.map((k) => ({ ...k, paise: decimalToPaise(k.amount) }));
}

export async function matchLine(bankLineId: string, journalLineId: string, by: string): Promise<boolean> {
  const sql = await getSql();
  try {
    const rows = await sql.query(
      `update bank_lines b set status = 'matched', journal_line_id = l.id, decided_by = $3
         from journal_lines l join ledger_accounts a on a.id = l.account_id
        where b.id = $1 and b.status = 'unmatched' and l.id = $2::bigint and a.code = '1010' and a.entity_id = b.entity_id
          and (l.debit - l.credit) = b.amount
        returning b.id`,
      [bankLineId, journalLineId, by],
    );
    return rows.length > 0;
  } catch {
    return false; // already used by another statement line
  }
}

/** Posts an unmatched statement line as a new entry against the chosen account, and ties them together. */
export async function postLine(bankLineId: string, counterCode: string, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const b = (await db.query<{ entity_id: string; txn_date: string; description: string; amount: string }>(
      "select entity_id, txn_date::text, description, amount::text from bank_lines where id = $1 and status = 'unmatched' for update",
      [bankLineId],
    ))[0];
    if (!b || counterCode === "1010") return false;
    const amount = decimalToPaise(b.amount);
    const abs = amount < 0n ? -amount : amount;
    const entry = await postByCodes(db, {
      entityId: b.entity_id, date: b.txn_date, by, sourceType: "bank", sourceId: bankLineId,
      memo: `Bank: ${b.description || "statement line"}`.slice(0, 300),
      lines: amount > 0n
        ? [{ code: "1010", debit: abs, credit: 0n }, { code: counterCode, debit: 0n, credit: abs }]
        : [{ code: counterCode, debit: abs, credit: 0n }, { code: "1010", debit: 0n, credit: abs }],
    });
    const line = (await db.query<{ id: string }>(
      `select l.id::text from journal_lines l join ledger_accounts a on a.id = l.account_id where l.entry_id = $1 and a.code = '1010'`,
      [entry],
    ))[0];
    await db.query(
      "update bank_lines set status = 'posted', journal_line_id = $2::bigint, journal_entry_id = $3, decided_by = $4 where id = $1",
      [bankLineId, line.id, entry, by],
    );
    return true;
  });
}

export async function setIgnored(bankLineId: string, ignored: boolean, by: string) {
  const sql = await getSql();
  const rows = await sql.query(
    `update bank_lines set status = $2, decided_by = $3 where id = $1 and status = $4 returning id`,
    [bankLineId, ignored ? "ignored" : "unmatched", by, ignored ? "unmatched" : "ignored"],
  );
  return rows.length > 0;
}

/** Undoes a match (not a posting: a posted line is undone by reversing its entry in Books). */
export async function unmatch(bankLineId: string, by: string) {
  const sql = await getSql();
  const rows = await sql.query(
    "update bank_lines set status = 'unmatched', journal_line_id = null, decided_by = $2 where id = $1 and status = 'matched' returning id",
    [bankLineId, by],
  );
  return rows.length > 0;
}

/** Bank balance from the latest statement line against the books' bank balance on that date. */
export async function reconciliation(entityId: string) {
  const sql = await getSql();
  const last = (await sql.query<{ txn_date: string; balance: string | null }>(
    "select txn_date::text, balance::text from bank_lines where entity_id = $1 and balance is not null order by txn_date desc, seq desc limit 1",
    [entityId],
  ))[0];
  const asOf = last?.txn_date ?? new Date().toISOString().slice(0, 10);
  const book = (await sql.query<{ amount: string }>(
    `select coalesce(sum(l.debit - l.credit), 0)::text as amount
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where a.entity_id = $1 and a.code = '1010' and e.entry_date <= $2::date`,
    [entityId, asOf],
  ))[0];
  const counts = (await sql.query<{ unmatched: number; matched: number; posted: number; ignored: number }>(
    `select count(*) filter (where status = 'unmatched')::int as unmatched, count(*) filter (where status = 'matched')::int as matched,
            count(*) filter (where status = 'posted')::int as posted, count(*) filter (where status = 'ignored')::int as ignored
       from bank_lines where entity_id = $1`,
    [entityId],
  ))[0];
  const bank = last?.balance != null ? decimalToPaise(last.balance) : null;
  const bookBal = decimalToPaise(book.amount);
  return { asOf, bank, book: bookBal, difference: bank === null ? null : bank - bookBal, ...counts };
}
