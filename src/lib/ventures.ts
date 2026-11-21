import { getSql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, postByCodes } from "./books";
import { feeFor, monthEnd, sharesFit, statement, type FeeRule, type OperatorTerm } from "./venture-calc";

export type VentureRow = {
  id: string; name: string; pillar: "build" | "co_build"; entity_id: string; entity_name: string; entity_kind: string;
  fee_type: FeeRule["type"]; fee_fixed: string; fee_bps: number; status: string; notes: string;
};
export type OperatorRow = {
  id: string; name: string; user_id: string | null; user_email: string | null; basis: "revenue" | "profit"; share_bps: number; active: boolean;
};
export type PeriodRow = {
  id: string; period: string; revenue: string; costs: string; fee: string; operator_total: string; net: string;
  payouts: { id: string; operator_id: string; operator_name: string; amount: string; paid_on: string | null }[];
};

const VENTURE_SELECT = `
  select v.id, v.name, v.pillar, v.entity_id, e.name as entity_name, e.kind as entity_kind, v.fee_type,
         v.fee_fixed::text, v.fee_bps, v.status, v.notes
    from ventures v join entities e on e.id = v.entity_id`;

/** All ventures, or only those where this operator is linked. */
export async function listVentures(onlyForUser: string | null) {
  const sql = await getSql();
  if (onlyForUser) {
    return sql.query<VentureRow>(
      `${VENTURE_SELECT} where exists (select 1 from venture_operators o where o.venture_id = v.id and o.user_id = $1)
        order by v.name`,
      [onlyForUser],
    );
  }
  return sql.query<VentureRow>(`${VENTURE_SELECT} order by v.status, v.name`);
}

export async function getVenture(id: string) {
  const sql = await getSql();
  return (await sql.query<VentureRow>(`${VENTURE_SELECT} where v.id = $1`, [id]))[0] ?? null;
}

export async function listOperators(ventureId: string) {
  const sql = await getSql();
  return sql.query<OperatorRow>(
    `select o.id, o.name, o.user_id, u.email as user_email, o.basis, o.share_bps, o.active
       from venture_operators o left join users u on u.id = o.user_id where o.venture_id = $1 order by o.created_at`,
    [ventureId],
  );
}

export async function listPeriods(ventureId: string) {
  const sql = await getSql();
  return sql.query<PeriodRow>(
    `select p.id, p.period::text, p.revenue::text, p.costs::text, p.fee::text, p.operator_total::text, p.net::text,
            coalesce((select json_agg(json_build_object('id', x.id, 'operator_id', x.operator_id, 'operator_name', o.name,
                        'amount', x.amount::text, 'paid_on', x.paid_on::text) order by o.created_at)
                      from venture_payouts x join venture_operators o on o.id = x.operator_id where x.period_id = p.id), '[]'::json) as payouts
       from venture_periods p where p.venture_id = $1 order by p.period desc`,
    [ventureId],
  );
}

export async function operatorUsers() {
  const sql = await getSql();
  return sql.query<{ id: string; email: string }>(
    "select id, email from users where role = 'operator' and status = 'active' order by email",
  );
}

export async function createVenture(v: {
  name: string; pillar: "build" | "co_build"; entityId: string; fee: FeeRule; notes: string; by: string;
}): Promise<string | "exists"> {
  const sql = await getSql();
  const taken = await sql.query("select 1 from ventures where lower(name) = lower($1)", [v.name]);
  if (taken.length) return "exists";
  const rows = await sql.query<{ id: string }>(
    `insert into ventures (name, pillar, entity_id, fee_type, fee_fixed, fee_bps, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [v.name, v.pillar, v.entityId, v.fee.type, paiseToDecimal(v.fee.fixed), v.fee.bps, v.notes, v.by],
  );
  return rows[0].id;
}

export async function addOperator(o: {
  ventureId: string; name: string; userId: string | null; basis: "revenue" | "profit"; bps: number;
}): Promise<"ok" | "over-100"> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    await db.query("select id from ventures where id = $1 for update", [o.ventureId]);
    const existing = await db.query<{ id: string; basis: "revenue" | "profit"; share_bps: number }>(
      "select id, basis, share_bps from venture_operators where venture_id = $1 and active",
      [o.ventureId],
    );
    const terms: OperatorTerm[] = existing.map((e) => ({ id: e.id, basis: e.basis, bps: e.share_bps }));
    if (!sharesFit(terms, { id: "new", basis: o.basis, bps: o.bps })) return "over-100" as const;
    await db.query(
      "insert into venture_operators (venture_id, name, user_id, basis, share_bps) values ($1,$2,$3,$4,$5)",
      [o.ventureId, o.name, o.userId, o.basis, o.bps],
    );
    return "ok" as const;
  });
}

/**
 * Closes one month for a venture and posts it, all or nothing:
 * in the venture's books, revenue and costs through the bank, operator shares and the fee as payables;
 * in Boring PE's books, the fee as a receivable and management fee income. A venture inside Boring PE
 * itself pays no fee to itself.
 */
export async function closePeriod(p: {
  ventureId: string; period: string; revenue: bigint; costs: bigint; by: string;
}): Promise<"ok" | "exists" | "not-found" | "no-boring-pe"> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const v = (await db.query<VentureRow>(`${VENTURE_SELECT} where v.id = $1 for update of v`, [p.ventureId]))[0];
    if (!v) return "not-found" as const;
    if ((await db.query("select 1 from venture_periods where venture_id = $1 and period = $2::date", [v.id, p.period])).length) {
      return "exists" as const;
    }
    const ops = await db.query<{ id: string; basis: "revenue" | "profit"; share_bps: number }>(
      "select id, basis, share_bps from venture_operators where venture_id = $1 and active order by created_at",
      [v.id],
    );
    const internal = v.entity_kind === "boring_pe";
    const fee = internal ? 0n : feeFor({ type: v.fee_type, fixed: decimalToPaise(v.fee_fixed), bps: v.fee_bps }, p.revenue);
    const s = statement(p.revenue, p.costs, fee, ops.map((o) => ({ id: o.id, basis: o.basis, bps: o.share_bps })));
    const date = monthEnd(p.period);
    const label = `${v.name} statement ${p.period.slice(0, 7)}`;

    const lines = [
      { code: "1010", debit: p.revenue, credit: 0n }, { code: "4040", debit: 0n, credit: p.revenue },
      { code: "5900", debit: p.costs, credit: 0n }, { code: "1010", debit: 0n, credit: p.costs },
      { code: "5080", debit: s.operatorTotal, credit: 0n }, { code: "2010", debit: 0n, credit: s.operatorTotal },
      { code: "5100", debit: fee, credit: 0n }, { code: "2010", debit: 0n, credit: fee },
    ];
    const journal = lines.some((l) => l.debit > 0n)
      ? await postByCodes(db, { entityId: v.entity_id, date, memo: label, by: p.by, sourceType: "venture", sourceId: v.id, lines })
      : null;

    let feeJournal: string | null = null;
    if (fee > 0n) {
      const bpe = (await db.query<{ id: string }>("select id from entities where kind = 'boring_pe' and active order by created_at limit 1"))[0];
      if (!bpe) throw new Error("no-boring-pe");
      feeJournal = await postByCodes(db, {
        entityId: bpe.id, date, memo: `Business House fee: ${label}`, by: p.by, sourceType: "venture_fee", sourceId: v.id,
        lines: [{ code: "1100", debit: fee, credit: 0n }, { code: "4010", debit: 0n, credit: fee }],
      });
    }

    const period = (await db.query<{ id: string }>(
      `insert into venture_periods (venture_id, period, revenue, costs, fee, operator_total, net, journal_entry_id, fee_journal_id, closed_by)
       values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [v.id, p.period, paiseToDecimal(p.revenue), paiseToDecimal(p.costs), paiseToDecimal(fee),
        paiseToDecimal(s.operatorTotal), paiseToDecimal(s.net), journal, feeJournal, p.by],
    ))[0];
    for (const share of s.shares) {
      if (share.amount <= 0n) continue;
      await db.query("insert into venture_payouts (period_id, operator_id, amount) values ($1, $2, $3)", [
        period.id, share.id, paiseToDecimal(share.amount),
      ]);
    }
    return "ok" as const;
  });
}

/** Pays an operator's share: clears the payable against the bank in the venture's books. Once only. */
export async function payPayout(id: string, date: string, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const row = (await db.query<{ id: string; amount: string; entity_id: string; venture_id: string; name: string; period: string; operator: string }>(
      `select x.id, x.amount::text, v.entity_id, v.id as venture_id, v.name, p.period::text, o.name as operator
         from venture_payouts x join venture_periods p on p.id = x.period_id join ventures v on v.id = p.venture_id
         join venture_operators o on o.id = x.operator_id
        where x.id = $1 and x.paid_on is null for update of x`,
      [id],
    ))[0];
    if (!row) return false;
    const amount = decimalToPaise(row.amount);
    if (amount <= 0n) return false;
    const journal = await postByCodes(db, {
      entityId: row.entity_id, date, by, sourceType: "venture_payout", sourceId: row.venture_id,
      memo: `Paid ${row.operator}: ${row.name} ${row.period.slice(0, 7)}`,
      lines: [{ code: "2010", debit: amount, credit: 0n }, { code: "1010", debit: 0n, credit: amount }],
    });
    await db.query("update venture_payouts set paid_on = $2::date, pay_journal_id = $3 where id = $1", [id, date, journal]);
    return true;
  });
}
