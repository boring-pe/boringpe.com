import { getSql } from "./db";
import { decimalToPaise, listEntities } from "./books";
import { listHoldings, toTxns, type HoldingRow } from "./investments";
import { buildTree, figuresOf, flatten, monthEnds, type Figures, type Node, type Stake, type Transfer, type Unit } from "./networth-calc";
import { position } from "./portfolio-calc";

type Row = { entity_id: string; type: string; bal: bigint; flow: bigint; fees: bigint };

const stakesAt = (holdings: HoldingRow[], asOf: string): Stake[] =>
  holdings.map((h) => {
    const p = position(toTxns(h).filter((t) => t.date <= asOf));
    return { holder: h.holder_entity_id, target: h.target_entity_id, cost: p.costRemaining, value: p.currentValue };
  });

function unitsFrom(entities: Awaited<ReturnType<typeof listEntities>>, rows: Row[], stakes: Stake[]): Unit[] {
  return entities.map((e) => {
    const mine = rows.filter((r) => r.entity_id === e.id);
    const of = (type: string, f: "bal" | "flow") => mine.find((r) => r.type === type)?.[f] ?? 0n;
    const held = stakes.filter((s) => s.holder === e.id);
    return {
      id: e.id, name: e.name, kind: e.kind, workspace: e.workspace, parentId: e.parent_id,
      assets: of("asset", "bal"),
      liabilities: -of("liability", "bal"),
      income: -of("income", "flow"),
      expense: of("expense", "flow"),
      cost: held.reduce((s, x) => s + x.cost, 0n),
      value: held.reduce((s, x) => s + x.value, 0n),
      fees: mine.reduce((s, r) => s + r.fees, 0n),
    };
  });
}

/** The whole tree with each level's figures: balances at `to`, income and expenses from `from` to `to`. */
export async function netWorthReport(from: string, to: string) {
  const sql = await getSql();
  const entities = await listEntities();
  const ids = entities.map((e) => e.id);
  const [rows, gifts, holdings] = await Promise.all([
    sql.query<{ entity_id: string; type: string; bal: string; flow: string; fees: string }>(
      `select a.entity_id, a.type,
              coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= $3::date), 0)::text as bal,
              coalesce(sum(l.debit - l.credit) filter (where e.entry_date between $2::date and $3::date), 0)::text as flow,
              coalesce(sum(l.debit - l.credit) filter (where a.code = '5100' and e.entry_date between $2::date and $3::date), 0)::text as fees
         from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
        where a.entity_id = any($1::text[]) group by 1, 2`,
      [ids, from, to],
    ),
    sql.query<{ from_entity_id: string | null; to_entity_id: string; amount: string }>(
      `select from_entity_id, to_entity_id, amount::text from contributions where contrib_date between $1::date and $2::date`,
      [from, to],
    ),
    listHoldings(),
  ]);
  const stakes = stakesAt(holdings, to);
  const units = unitsFrom(entities, rows.map((r) => ({ ...r, bal: decimalToPaise(r.bal), flow: decimalToPaise(r.flow), fees: decimalToPaise(r.fees) })), stakes);
  const transfers: Transfer[] = gifts.map((g) => ({ from: g.from_entity_id, to: g.to_entity_id, amount: decimalToPaise(g.amount) }));
  const feeEarners = new Set(entities.filter((e) => e.kind === "boring_pe").map((e) => e.id));
  const tree = buildTree(units);
  const figures = new Map<string, Figures>(flatten(tree).map((n) => [n.key, figuresOf(n.ids, units, transfers, stakes, feeEarners)]));
  return { tree, figures, units, from, to };
}

export type TrendPoint = { month: string; netWorth: bigint; marketNetWorth: bigint; income: bigint; expense: bigint };

/** Month by month for one level, over the twelve months ending with `to`. */
export async function netWorthTrend(node: Node, to: string, months = 12): Promise<TrendPoint[]> {
  const sql = await getSql();
  const entities = (await listEntities()).filter((e) => node.ids.has(e.id));
  const ids = entities.map((e) => e.id);
  // The last point stops at `to`, not the end of its month.
  const ends = monthEnds(to, months).map((e) => (e > to ? to : e));
  const first = `${ends[0].slice(0, 7)}-01`;
  const [rows, gifts, holdings] = await Promise.all([
    sql.query<{ entity_id: string; type: string; month: string; amount: string; fees: string }>(
      `select a.entity_id, a.type, case when e.entry_date < $2::date then 'before' else to_char(e.entry_date, 'YYYY-MM') end as month,
              sum(l.debit - l.credit)::text as amount,
              coalesce(sum(l.debit - l.credit) filter (where a.code = '5100'), 0)::text as fees
         from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
        where a.entity_id = any($1::text[]) and e.entry_date <= $3::date group by 1, 2, 3`,
      [ids, first, ends[ends.length - 1]],
    ),
    sql.query<{ from_entity_id: string | null; to_entity_id: string; amount: string; month: string }>(
      `select from_entity_id, to_entity_id, amount::text, to_char(contrib_date, 'YYYY-MM') as month from contributions
        where contrib_date between $1::date and $2::date`,
      [first, ends[ends.length - 1]],
    ),
    listHoldings(),
  ]);
  const feeEarners = new Set(entities.filter((e) => e.kind === "boring_pe").map((e) => e.id));
  return ends.map((end) => {
    const month = end.slice(0, 7);
    // Balances to the end of this month; income and expenses in this month alone.
    const asRows: Row[] = [];
    for (const e of ids) {
      for (const type of ["asset", "liability", "equity", "income", "expense"]) {
        const mine = rows.filter((r) => r.entity_id === e && r.type === type);
        if (!mine.length) continue;
        const upTo = mine.filter((r) => r.month === "before" || r.month <= month);
        const inMonth = mine.filter((r) => r.month === month);
        asRows.push({
          entity_id: e, type,
          bal: sumDec(upTo.map((r) => r.amount)),
          flow: sumDec(inMonth.map((r) => r.amount)),
          fees: sumDec(inMonth.map((r) => r.fees)),
        });
      }
    }
    const stakes = stakesAt(holdings, end);
    const units = unitsFrom(entities, asRows, stakes);
    const transfers: Transfer[] = gifts.filter((g) => g.month === month).map((g) => ({ from: g.from_entity_id, to: g.to_entity_id, amount: decimalToPaise(g.amount) }));
    const f = figuresOf(node.ids, units, transfers, stakes, feeEarners);
    return { month, netWorth: f.netWorth, marketNetWorth: f.marketNetWorth, income: f.income, expense: f.expense };
  });
}

/** Adds decimal rupee strings exactly, in paise. */
function sumDec(values: string[]): bigint {
  return values.reduce((s, v) => s + decimalToPaise(v), 0n);
}
