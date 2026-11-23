import { getSql } from "./db";
import { balanceSheet, profitAndLoss } from "./accounting";
import { balances, decimalToPaise, listEntities } from "./books";
import { listHoldings, toTxns } from "./investments";
import { consolidate, fillMonths, monthsBetween } from "./mis-calc";
import { position } from "./portfolio-calc";
import { entityIdsInView } from "./workspaces";

/** Everything the MIS page shows for one date range, in paise. */
export async function misReport(from: string, to: string) {
  const sql = await getSql();
  const entities = await listEntities();
  const ids = await entityIdsInView();

  const perEntity = await Promise.all(
    entities.map(async (e) => {
      const [period, upTo] = await Promise.all([balances(e.id, from, to), balances(e.id, null, to)]);
      const pl = profitAndLoss(period);
      const bs = balanceSheet(upTo);
      const cash = upTo.filter((r) => r.code === "1010" || r.code === "1020").reduce((s, r) => s + r.debit - r.credit, 0n);
      return {
        id: e.id, name: e.name, kind: e.kind,
        income: pl.income.total, expense: pl.expense.total, net: pl.net,
        cash, assets: bs.assets.total, liabilities: bs.liabilities.total, equity: bs.equity.total + bs.earnings,
      };
    }),
  );

  // Business Studio fees between our own entities: the 5100 expense lines in the period.
  const ic = await sql.query<{ amount: string }>(
    `select coalesce(sum(l.debit - l.credit), 0)::text as amount
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where a.code = '5100' and e.entry_date between $1::date and $2::date and a.entity_id = any($3::text[])`,
    [from, to, ids],
  );
  const intercompany = decimalToPaise(ic[0].amount);
  const group = consolidate(perEntity, intercompany);

  // Monthly trend for the group, with the same fees taken out on both sides.
  const monthly = await sql.query<{ month: string; income: string; expense: string }>(
    `select to_char(e.entry_date, 'YYYY-MM') as month,
            coalesce(sum(l.credit - l.debit) filter (where a.type = 'income' and e.source_type <> 'venture_fee'), 0)::text as income,
            coalesce(sum(l.debit - l.credit) filter (where a.type = 'expense' and a.code <> '5100'), 0)::text as expense
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where e.entry_date between $1::date and $2::date and a.type in ('income', 'expense') and a.entity_id = any($3::text[])
      group by 1`,
    [from, to, ids],
  );
  const months = fillMonths(
    monthsBetween(from, to),
    monthly.map((m) => ({ month: m.month, income: decimalToPaise(m.income), expense: decimalToPaise(m.expense) })),
    (month) => ({ month, income: 0n, expense: 0n }),
  );

  // Ventures by vertical from closed monthly statements.
  const ventureRows = await sql.query<{ pillar: string; revenue: string; costs: string; fee: string; operators: string; net: string; months: number }>(
    `select v.pillar, sum(p.revenue)::text as revenue, sum(p.costs)::text as costs, sum(p.fee)::text as fee,
            sum(p.operator_total)::text as operators, sum(p.net)::text as net, count(*)::int as months
       from venture_periods p join ventures v on v.id = p.venture_id
      where p.period between date_trunc('month', $1::date)::date and $2::date and v.entity_id = any($3::text[])
      group by v.pillar order by v.pillar`,
    [from, to, ids],
  );
  const ventures = ventureRows.map((r) => ({
    pillar: r.pillar, months: r.months,
    revenue: decimalToPaise(r.revenue), costs: decimalToPaise(r.costs), fee: decimalToPaise(r.fee),
    operators: decimalToPaise(r.operators), net: decimalToPaise(r.net),
  }));

  // Holdings by vertical, as of now.
  const holdings = await listHoldings();
  const byPillar = new Map<string, { count: number; invested: bigint; value: bigint; returned: bigint }>();
  for (const h of holdings) {
    const p = position(toTxns(h));
    const cur = byPillar.get(h.pillar) ?? { count: 0, invested: 0n, value: 0n, returned: 0n };
    byPillar.set(h.pillar, {
      count: cur.count + 1, invested: cur.invested + p.invested, value: cur.value + p.currentValue, returned: cur.returned + p.proceeds + p.income,
    });
  }

  const people = await sql.query<{ headcount: number; payroll: string }>(
    `select (select count(*)::int from employees where status = 'active' and entity_id = any($3::text[])) as headcount,
            (select coalesce(sum(gross), 0)::text from pay_runs where status in ('posted', 'paid') and entity_id = any($3::text[])
               and period between date_trunc('month', $1::date)::date and $2::date) as payroll`,
    [from, to, ids],
  );
  const impact = await sql.query<{ amount: string; n: number }>(
    `select coalesce(sum(amount), 0)::text as amount, count(*)::int as n from contributions
      where contrib_date between $1::date and $2::date and (to_entity_id = any($3::text[]) or from_entity_id = any($3::text[]))`,
    [from, to, ids],
  );

  return {
    perEntity, intercompany, group, months, ventures,
    holdings: [...byPillar.entries()].map(([pillar, v]) => ({ pillar, ...v })),
    headcount: people[0].headcount, payroll: decimalToPaise(people[0].payroll),
    impact: { amount: decimalToPaise(impact[0].amount), count: impact[0].n },
  };
}
