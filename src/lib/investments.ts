import { getSql, type Sql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, postByCodes } from "./books";
import { entityIdsInView } from "./workspaces";
import { exitAllowed, position, type AssetClass, type HoldingPillar, type Instrument, type Txn, type TxnKind } from "./portfolio-calc";

export type HoldingRow = {
  id: string;
  name: string;
  asset_class: AssetClass;
  pillar: HoldingPillar;
  status: "active" | "exited";
  notes: string;
  holder_entity_id: string;
  holder_name: string;
  target_entity_id: string | null;
  target_name: string | null;
  txns: { id: string; kind: TxnKind; date: string; amount: string; cost_recovered: string; memo: string; journal_entry_id: string | null }[];
};

export const toTxns = (h: Pick<HoldingRow, "txns">): Txn[] =>
  h.txns.map((t) => ({ kind: t.kind, date: t.date, amount: decimalToPaise(t.amount), costRecovered: decimalToPaise(t.cost_recovered) }));

const HOLDING_SELECT = `
  select h.id, h.name, h.asset_class, h.pillar, h.status, h.notes, h.holder_entity_id, he.name as holder_name,
         h.target_entity_id, te.name as target_name,
         coalesce((select json_agg(json_build_object('id', t.id, 'kind', t.kind, 'date', t.txn_date::text,
                     'amount', t.amount::text, 'cost_recovered', t.cost_recovered::text, 'memo', t.memo,
                     'journal_entry_id', t.journal_entry_id) order by t.txn_date, t.created_at)
                   from holding_txns t where t.holding_id = h.id), '[]'::json) as txns
    from holdings h join entities he on he.id = h.holder_entity_id left join entities te on te.id = h.target_entity_id`;

export async function listHoldings() {
  const sql = await getSql();
  return sql.query<HoldingRow>(`${HOLDING_SELECT} where h.holder_entity_id = any($1::text[]) order by h.status, h.name`, [await entityIdsInView()]);
}

export async function getHolding(id: string) {
  const sql = await getSql();
  return (await sql.query<HoldingRow>(`${HOLDING_SELECT} where h.id = $1 and h.holder_entity_id = any($2::text[])`, [id, await entityIdsInView()]))[0] ?? null;
}

export async function createHolding(h: {
  name: string; holderEntityId: string; assetClass: AssetClass; pillar: HoldingPillar; targetEntityId: string | null; notes: string; by: string;
}) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `insert into holdings (name, holder_entity_id, asset_class, pillar, target_entity_id, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [h.name, h.holderEntityId, h.assetClass, h.pillar, h.targetEntityId, h.notes, h.by],
  );
  return rows[0].id;
}

export type TxnInput = {
  holdingId: string;
  kind: TxnKind;
  date: string;
  amount: bigint;
  costRecovered: bigint;
  memo: string;
  shares: number | null;
  markExited: boolean;
  by: string;
};

/**
 * Records a holding transaction and posts it to the books in one transaction.
 * invest: Investments / Bank in the holder's books, and when the target is one of our entities,
 *   Bank / Capital in its books plus an optional cap table row.
 * income: Bank / Investment income. exit: Bank, less the cost it recovers, with the gain or loss in
 *   Investment income. valuation: no posting.
 */
export async function recordTxn(input: TxnInput): Promise<"ok" | "not-found" | "too-much-cost" | "cost-left"> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const holding = (await db.query<{ id: string; name: string; holder_entity_id: string; holder_name: string; target_entity_id: string | null }>(
      `select h.id, h.name, h.holder_entity_id, e.name as holder_name, h.target_entity_id
         from holdings h join entities e on e.id = h.holder_entity_id where h.id = $1 for update of h`,
      [input.holdingId],
    ))[0];
    if (!holding) return "not-found" as const;

    const existing = await db.query<{ kind: TxnKind; date: string; amount: string; cost_recovered: string }>(
      "select kind, txn_date::text as date, amount::text, cost_recovered::text from holding_txns where holding_id = $1",
      [holding.id],
    );
    const txns: Txn[] = existing.map((t) => ({
      kind: t.kind, date: t.date, amount: decimalToPaise(t.amount), costRecovered: decimalToPaise(t.cost_recovered),
    }));
    if (input.kind === "exit" && !exitAllowed(txns, input.costRecovered)) return "too-much-cost" as const;
    // Fully exited means nothing is left at cost; otherwise the books would still show the investment.
    if (input.kind === "exit" && input.markExited && position(txns).costRemaining !== input.costRecovered) {
      return "cost-left" as const;
    }

    const memo = `${holding.name}${input.memo ? `: ${input.memo}` : ""}`;
    const base = { entityId: holding.holder_entity_id, date: input.date, by: input.by, sourceType: "holding", sourceId: holding.id };
    let journalId: string | null = null;
    const a = input.amount;
    if (input.kind === "invest") {
      journalId = await postByCodes(db, { ...base, memo: `Investment in ${memo}`, lines: [
        { code: "1200", debit: a, credit: 0n }, { code: "1010", debit: 0n, credit: a },
      ] });
      if (holding.target_entity_id && holding.target_entity_id !== holding.holder_entity_id) {
        await postByCodes(db, {
          entityId: holding.target_entity_id, date: input.date, by: input.by, sourceType: "holding", sourceId: holding.id,
          memo: `Capital from ${holding.holder_name}`,
          lines: [{ code: "1010", debit: a, credit: 0n }, { code: "3010", debit: 0n, credit: a }],
        });
        if (input.shares && input.shares > 0) {
          await db.query(
            `insert into cap_table (entity_id, holder_name, holder_entity_id, instrument, shares, invested, issued_on, created_by)
             values ($1, $2, $3, 'equity', $4, $5, $6::date, $7)`,
            [holding.target_entity_id, holding.holder_name, holding.holder_entity_id, input.shares, paiseToDecimal(a), input.date, input.by],
          );
        }
      }
    } else if (input.kind === "income") {
      journalId = await postByCodes(db, { ...base, memo: `Income from ${memo}`, lines: [
        { code: "1010", debit: a, credit: 0n }, { code: "4030", debit: 0n, credit: a },
      ] });
    } else if (input.kind === "exit") {
      const cost = input.costRecovered;
      const gain = a - cost;
      journalId = await postByCodes(db, { ...base, memo: `Exit from ${memo}`, lines: [
        { code: "1010", debit: a, credit: 0n },
        { code: "1200", debit: 0n, credit: cost },
        { code: "4030", debit: gain < 0n ? -gain : 0n, credit: gain > 0n ? gain : 0n },
      ] });
    }

    await db.query(
      `insert into holding_txns (holding_id, kind, txn_date, amount, cost_recovered, memo, journal_entry_id, created_by)
       values ($1, $2, $3::date, $4, $5, $6, $7, $8)`,
      [holding.id, input.kind, input.date, paiseToDecimal(a), paiseToDecimal(input.costRecovered), input.memo, journalId, input.by],
    );
    if (input.kind === "exit" && input.markExited) {
      await db.query("update holdings set status = 'exited' where id = $1", [holding.id]);
    }
    return "ok" as const;
  });
}

// ---- cap tables

export type CapRowDb = {
  id: string; holder_name: string; holder_entity_id: string | null; instrument: Instrument; shares: string; invested: string; issued_on: string; notes: string;
};

export async function listCapTable(entityId: string) {
  const sql = await getSql();
  return sql.query<CapRowDb>(
    `select id, holder_name, holder_entity_id, instrument, shares::text, invested::text, issued_on::text, notes
       from cap_table where entity_id = $1 order by issued_on, created_at`,
    [entityId],
  );
}

export async function addCapRow(r: {
  entityId: string; holderName: string; instrument: Instrument; shares: string; invested: bigint; issuedOn: string; notes: string; by: string;
}) {
  const sql = await getSql();
  await sql.query(
    `insert into cap_table (entity_id, holder_name, instrument, shares, invested, issued_on, notes, created_by)
     values ($1,$2,$3,$4,$5,$6::date,$7,$8)`,
    [r.entityId, r.holderName, r.instrument, r.shares, paiseToDecimal(r.invested), r.issuedOn, r.notes, r.by],
  );
}

// ---- contributions to Impact Marrow

export type ContributionRow = {
  id: string; from_name: string | null; to_name: string; amount: string; contrib_date: string; memo: string;
};

export async function listContributions() {
  const sql = await getSql();
  return sql.query<ContributionRow>(
    `select c.id, f.name as from_name, t.name as to_name, c.amount::text, c.contrib_date::text, c.memo
       from contributions c left join entities f on f.id = c.from_entity_id join entities t on t.id = c.to_entity_id
      where c.to_entity_id = any($1::text[]) or c.from_entity_id = any($1::text[])
      order by c.contrib_date desc, c.created_at desc`,
    [await entityIdsInView()],
  );
}

/**
 * Money given to Impact Marrow or its fund: an expense in the giver's books (when the giver is one of
 * our entities) and capital in the receiver's. A null giver is Rahul Mane personally.
 */
export async function contribute(c: {
  fromEntityId: string | null; toEntityId: string; amount: bigint; date: string; memo: string; by: string;
}) {
  const sql = await getSql();
  return sql.tx(async (db: Sql) => {
    const names = await db.query<{ id: string; name: string }>(
      "select id, name from entities where id = any($1::text[])",
      [[c.fromEntityId, c.toEntityId].filter(Boolean)],
    );
    const name = (id: string | null) => (id ? names.find((n) => n.id === id)?.name : "Rahul Mane");
    const memo = c.memo || "Contribution";
    let fromJournal: string | null = null;
    if (c.fromEntityId) {
      fromJournal = await postByCodes(db, {
        entityId: c.fromEntityId, date: c.date, by: c.by, sourceType: "contribution",
        memo: `${memo} to ${name(c.toEntityId)}`,
        lines: [{ code: "5090", debit: c.amount, credit: 0n }, { code: "1010", debit: 0n, credit: c.amount }],
      });
    }
    const toJournal = await postByCodes(db, {
      entityId: c.toEntityId, date: c.date, by: c.by, sourceType: "contribution",
      memo: `${memo} from ${name(c.fromEntityId)}`,
      lines: [{ code: "1010", debit: c.amount, credit: 0n }, { code: "3010", debit: 0n, credit: c.amount }],
    });
    await db.query(
      `insert into contributions (from_entity_id, to_entity_id, amount, contrib_date, memo, from_journal_id, to_journal_id, created_by)
       values ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
      [c.fromEntityId, c.toEntityId, paiseToDecimal(c.amount), c.date, c.memo, fromJournal, toJournal, c.by],
    );
  });
}
