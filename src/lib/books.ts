import { getSql, type Sql } from "./db";
import { DEFAULT_CHART, paiseToDecimal, type AccountType, type BalanceRow, type EntityKind, type Line } from "./accounting";

export type EntityRow = {
  id: string;
  name: string;
  kind: EntityKind;
  legal_form: string;
  parent_id: string | null;
  parent_name: string | null;
};
export type AccountRow = { id: string; entity_id: string; code: string; name: string; type: AccountType; active: boolean };
export type JournalRow = {
  id: string;
  entry_date: string;
  memo: string;
  source_type: string;
  reversal_of: string | null;
  reversed_by: string | null;
  created_by_email: string | null;
  total: string;
  lines: { account: string; debit: string; credit: string }[];
};

/** numeric text such as "1500.5" or "0" to paise. */
export function decimalToPaise(text: string): bigint {
  const neg = text.startsWith("-");
  const [whole, frac = ""] = (neg ? text.slice(1) : text).split(".");
  const p = BigInt(whole || "0") * 100n + BigInt((frac + "00").slice(0, 2));
  return neg ? -p : p;
}

const chartArrays = () => [
  DEFAULT_CHART.map((a) => a.code),
  DEFAULT_CHART.map((a) => a.name),
  DEFAULT_CHART.map((a) => a.type),
];

/** Entities created by the migration have no accounts yet: give each the default chart once. */
export async function ensureCharts() {
  const sql = await getSql();
  const [codes, names, types] = chartArrays();
  await sql.query(
    `insert into ledger_accounts (entity_id, code, name, type)
       select e.id, c.code, c.name, c.type
         from entities e, unnest($1::text[], $2::text[], $3::text[]) as c(code, name, type)
        where not exists (select 1 from ledger_accounts a where a.entity_id = e.id)
     on conflict do nothing`,
    [codes, names, types],
  );
}

export async function listEntities() {
  await ensureCharts();
  const sql = await getSql();
  return sql.query<EntityRow>(
    `select e.id, e.name, e.kind, e.legal_form, e.parent_id, p.name as parent_name
       from entities e left join entities p on p.id = e.parent_id
      where e.active order by (e.kind = 'boring_pe') desc, e.name`,
  );
}

/** Returns the new id, or "exists" when the name is taken. */
export async function createEntity(e: {
  name: string; kind: EntityKind; legalForm: string; parentId: string | null; by: string;
}): Promise<string | "exists"> {
  const sql = await getSql();
  const [codes, names, types] = chartArrays();
  try {
    const rows = await sql.query<{ entity_id: string }>(
      `with e as (
         insert into entities (name, kind, legal_form, parent_id, created_by) values ($1,$2,$3,$4,$5) returning id
       )
       insert into ledger_accounts (entity_id, code, name, type)
         select e.id, c.code, c.name, c.type from e, unnest($6::text[], $7::text[], $8::text[]) as c(code, name, type)
       returning entity_id`,
      [e.name, e.kind, e.legalForm, e.parentId, e.by, codes, names, types],
    );
    return rows[0].entity_id;
  } catch (err) {
    if (/duplicate key|unique/i.test(String((err as Error).message))) return "exists";
    throw err;
  }
}

export async function listAccounts(entityId: string) {
  const sql = await getSql();
  return sql.query<AccountRow>(
    "select id, entity_id, code, name, type, active from ledger_accounts where entity_id = $1 order by code",
    [entityId],
  );
}

export async function createAccount(a: { entityId: string; code: string; name: string; type: AccountType }) {
  const sql = await getSql();
  try {
    await sql.query("insert into ledger_accounts (entity_id, code, name, type) values ($1,$2,$3,$4)", [
      a.entityId, a.code, a.name, a.type,
    ]);
    return "ok" as const;
  } catch (err) {
    if (/duplicate key|unique/i.test(String((err as Error).message))) return "exists" as const;
    throw err;
  }
}

type EntryInput = {
  entityId: string; date: string; memo: string; lines: Line[]; by: string; sourceType?: string; sourceId?: string | null;
};

/** Inserts one entry and its lines as a single statement. Throws if the books refuse it. */
async function insertEntry(db: Sql, e: EntryInput): Promise<string> {
  const rows = await db.query<{ entry_id: string }>(
    `with e as (
       insert into journal_entries (entity_id, entry_date, memo, source_type, source_id, created_by)
       values ($1, $2::date, $3, $4, $5, $6) returning id
     )
     insert into journal_lines (entry_id, account_id, debit, credit)
       select e.id, l.a, l.d, l.c from e, unnest($7::text[], $8::numeric[], $9::numeric[]) as l(a, d, c)
     returning entry_id`,
    [
      e.entityId, e.date, e.memo, e.sourceType ?? "manual", e.sourceId ?? null, e.by,
      e.lines.map((l) => l.accountId),
      e.lines.map((l) => paiseToDecimal(l.debit)),
      e.lines.map((l) => paiseToDecimal(l.credit)),
    ],
  );
  return rows[0].entry_id;
}

/** Posts one balanced entry atomically: the entry and all its lines are a single statement. */
export async function postEntry(e: EntryInput): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  try {
    return { ok: true, id: await insertEntry(await getSql(), e) };
  } catch (err) {
    return { ok: false, reason: String((err as Error).message) };
  }
}

export type CodeLine = { code: string; debit: bigint; credit: bigint };

/**
 * Posts an entry from account codes of the entity's chart, inside the caller's transaction.
 * Zero lines are dropped. Throws when an account is missing or the entry does not balance,
 * which rolls back everything else the caller did.
 */
export async function postByCodes(
  db: Sql,
  e: Omit<EntryInput, "lines"> & { lines: CodeLine[] },
): Promise<string> {
  const used = e.lines.filter((l) => l.debit > 0n || l.credit > 0n);
  const accounts = await db.query<{ id: string; code: string }>(
    "select id, code from ledger_accounts where entity_id = $1 and active and code = any($2::text[])",
    [e.entityId, used.map((l) => l.code)],
  );
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  const lines = used.map((l) => {
    const accountId = byCode.get(l.code);
    if (!accountId) throw new Error(`Account ${l.code} is missing from this entity's chart.`);
    return { accountId, debit: l.debit, credit: l.credit };
  });
  const d = lines.reduce((s, l) => s + l.debit, 0n);
  const c = lines.reduce((s, l) => s + l.credit, 0n);
  if (lines.length < 2 || d !== c) throw new Error("Entry does not balance.");
  return insertEntry(db, { ...e, lines });
}

/** Reverses a posted entry by posting its mirror image. Each entry can be reversed once. */
export async function reverseEntry(id: string, date: string, by: string): Promise<string | null> {
  const sql = await getSql();
  try {
    const rows = await sql.query<{ id: string | null }>(
      `with orig as (
         select * from journal_entries where id = $1 and reversed_by is null and reversal_of is null
       ),
       rev as (
         insert into journal_entries (entity_id, entry_date, memo, source_type, source_id, reversal_of, created_by)
         select entity_id, $2::date, 'Reversal: ' || memo, 'reversal', id, id, $3 from orig returning id
       ),
       ins as (
         insert into journal_lines (entry_id, account_id, debit, credit)
         select rev.id, l.account_id, l.credit, l.debit from rev, journal_lines l where l.entry_id = $1 returning 1
       ),
       upd as (
         update journal_entries set reversed_by = (select id from rev)
          where id = $1 and exists (select 1 from rev) returning 1
       )
       select (select id from rev) as id`,
      [id, date, by],
    );
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function listJournal(entityId: string, limit = 50) {
  const sql = await getSql();
  return sql.query<JournalRow>(
    `select e.id, e.entry_date::text as entry_date, e.memo, e.source_type, e.reversal_of, e.reversed_by,
            u.email as created_by_email,
            (select sum(debit) from journal_lines where entry_id = e.id)::text as total,
            coalesce((select json_agg(json_build_object('account', a.code || ' ' || a.name,
                        'debit', l.debit::text, 'credit', l.credit::text) order by l.id)
                      from journal_lines l join ledger_accounts a on a.id = l.account_id where l.entry_id = e.id), '[]'::json) as lines
       from journal_entries e left join users u on u.id = e.created_by
      where e.entity_id = $1 order by e.entry_date desc, e.created_at desc limit $2`,
    [entityId, limit],
  );
}

/** Per-account totals for an entity, optionally limited to a date range (inclusive). */
export async function balances(entityId: string, from: string | null, to: string | null): Promise<BalanceRow[]> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; code: string; name: string; type: AccountType; d: string; c: string }>(
    `select a.id, a.code, a.name, a.type, coalesce(s.d, 0)::text as d, coalesce(s.c, 0)::text as c
       from ledger_accounts a
       left join (
         select l.account_id, sum(l.debit) as d, sum(l.credit) as c
           from journal_lines l join journal_entries e on e.id = l.entry_id
          where e.entry_date >= coalesce($2::date, '0001-01-01') and e.entry_date <= coalesce($3::date, '9999-12-31')
          group by l.account_id
       ) s on s.account_id = a.id
      where a.entity_id = $1 order by a.code`,
    [entityId, from, to],
  );
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type, debit: decimalToPaise(r.d), credit: decimalToPaise(r.c),
  }));
}
