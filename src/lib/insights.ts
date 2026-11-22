import { getSql } from "./db";
import { decimalToPaise } from "./books";
import { fiscalYearOf } from "./hr-calc";
import { entityIdsInView, workspaceContext } from "./workspaces";
import { workspaceLabel } from "./workspace-calc";
import {
  budgetInsights,
  completeMonths,
  monthLabel,
  receivableInsights,
  runway,
  runwayInsight,
  sortInsights,
  spendingAnomaly,
  ventureInsights,
  type Insight,
} from "./insights-calc";

/** Months of history the rules look back over. */
const HISTORY = 6;
/** Months averaged for the burn rate. */
const BURN_MONTHS = 3;

export type Scope = { key: string; label: string; kind: "group" | "entity" | "venture" };

/**
 * Every insight for the firm-wide view: cash runway for the group and each entity, overdue
 * receivables by customer, budget variance year to date, venture trends and unusual spending.
 * Only for roles that can see firm data; callers check that.
 */
export async function firmInsights(today = new Date().toISOString().slice(0, 10)) {
  const sql = await getSql();
  const months = completeMonths(today, HISTORY);
  const lastMonth = months.at(-1)!;
  const from = `${months[0]}-01`;
  const currentStart = `${today.slice(0, 7)}-01`;
  const inView = await entityIdsInView();

  const [entities, flows, cash, overdue, ventures] = await Promise.all([
    sql.query<{ id: string; name: string }>(`select id, name from entities where active and id = any($1::text[]) order by name`, [inView]),
    sql.query<{ entity_id: string; code: string; name: string; type: string; month: string; amount: string }>(
      `select a.entity_id, a.code, a.name, a.type, to_char(e.entry_date, 'YYYY-MM') as month,
              sum(case when a.type = 'income' then l.credit - l.debit else l.debit - l.credit end)::text as amount
         from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
        where a.type in ('income', 'expense') and e.entry_date >= $1::date and e.entry_date < $2::date and a.entity_id = any($3::text[])
        group by 1, 2, 3, 4, 5`,
      [from, currentStart, inView],
    ),
    sql.query<{ entity_id: string; cash: string }>(
      `select a.entity_id, coalesce(sum(l.debit - l.credit), 0)::text as cash
         from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
        where a.code in ('1010', '1020', '1030') and e.entry_date <= $1::date and a.entity_id = any($2::text[]) group by 1`,
      [today, inView],
    ),
    sql.query<{ number: string | null; party: string; entity: string; outstanding: string; days: number }>(
      `select i.number, p.name as party, en.name as entity, (i.total - i.received - i.tds)::text as outstanding,
              ($1::date - i.due_date)::int as days
         from invoices i join parties p on p.id = i.party_id join entities en on en.id = i.entity_id
        where i.status = 'issued' and i.due_date < $1::date and i.entity_id = any($2::text[])`,
      [today, inView],
    ),
    sql.query<{ id: string; name: string; period: string | null; revenue: string | null; net: string | null }>(
      `select v.id, v.name, to_char(p.period, 'YYYY-MM') as period, p.revenue::text, p.net::text
         from ventures v left join venture_periods p on p.venture_id = v.id
        where v.status = 'active' and v.entity_id = any($1::text[]) order by v.name, p.period`,
      [inView],
    ),
  ]);

  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const insights: Insight[] = [];

  // Cash runway. Depreciation is left out: it is not cash going out.
  const netByEntity = new Map<string, Map<string, bigint>>();
  for (const f of flows) {
    if (f.code === "5200") continue;
    const m = netByEntity.get(f.entity_id) ?? new Map<string, bigint>();
    const v = decimalToPaise(f.amount);
    m.set(f.month, (m.get(f.month) ?? 0n) + (f.type === "income" ? v : -v));
    netByEntity.set(f.entity_id, m);
  }
  const burnMonths = months.slice(-BURN_MONTHS);
  const cashOf = new Map(cash.map((c) => [c.entity_id, decimalToPaise(c.cash)]));
  const netsFor = (ids: string[]) => burnMonths.map((m) => ids.reduce((s, id) => s + (netByEntity.get(id)?.get(m) ?? 0n), 0n));
  const ids = entities.map((e) => e.id);
  const groupCash = ids.reduce((s, id) => s + (cashOf.get(id) ?? 0n), 0n);
  const groupNets = netsFor(ids);
  const group = runwayInsight("Group", "/portal/reports", groupCash, groupNets);
  if (group) insights.push(group);
  for (const e of entities) {
    const one = runwayInsight(e.name, `/portal/books?e=${e.id}`, cashOf.get(e.id) ?? 0n, netsFor([e.id]));
    // A cash-generating entity is worth a line only at group level, to keep the list short.
    if (one && one.severity !== "good") insights.push(one);
  }

  insights.push(...receivableInsights(overdue.map((o) => ({ number: o.number, party: o.party, entity: o.entity, outstanding: decimalToPaise(o.outstanding), daysOverdue: o.days }))));

  // Budgets, financial year to date through the last whole month.
  const [fyFrom] = fiscalYearOf(`${lastMonth}-01`);
  const lastMonthEnd = new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [budget, actual] = await Promise.all([
    sql.query<{ entity_id: string; type: string; amount: string }>(
      `select a.entity_id, a.type, sum(b.amount)::text as amount from budgets b join ledger_accounts a on a.id = b.account_id
        where b.month between $1::date and $2::date and a.entity_id = any($3::text[]) group by 1, 2`,
      [fyFrom, `${lastMonth}-01`, inView],
    ),
    sql.query<{ entity_id: string; type: string; amount: string }>(
      `select a.entity_id, a.type, sum(case when a.type = 'income' then l.credit - l.debit else l.debit - l.credit end)::text as amount
         from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
        where a.type in ('income', 'expense') and e.entry_date between $1::date and $2::date and a.entity_id = any($3::text[]) group by 1, 2`,
      [fyFrom, lastMonthEnd, inView],
    ),
  ]);
  const pick = (rows: typeof budget, id: string, t: string) => decimalToPaise(rows.find((r) => r.entity_id === id && r.type === t)?.amount ?? "0");
  const fyStartYear = Number(fyFrom.slice(0, 4));
  for (const e of entities) {
    insights.push(...budgetInsights(e.name, `/portal/budgets?e=${e.id}&fy=${fyStartYear}&to=${lastMonthEnd}`, monthLabel(lastMonth), {
      incomeBudget: pick(budget, e.id, "income"), incomeActual: pick(actual, e.id, "income"),
      expenseBudget: pick(budget, e.id, "expense"), expenseActual: pick(actual, e.id, "expense"),
    }));
  }

  // Ventures.
  const byVenture = new Map<string, { id: string; name: string; periods: { period: string; revenue: bigint; net: bigint }[] }>();
  for (const v of ventures) {
    const entry = byVenture.get(v.id) ?? { id: v.id, name: v.name, periods: [] };
    if (v.period) entry.periods.push({ period: v.period, revenue: decimalToPaise(v.revenue ?? "0"), net: decimalToPaise(v.net ?? "0") });
    byVenture.set(v.id, entry);
  }
  for (const v of byVenture.values()) insights.push(...ventureInsights(v.name, `/portal/ventures?v=${v.id}`, lastMonth, v.periods));

  // Unusual spending per expense account.
  const accounts = new Map<string, { entity: string; code: string; name: string; byMonth: Map<string, bigint> }>();
  for (const f of flows) {
    if (f.type !== "expense") continue;
    const key = `${f.entity_id}:${f.code}`;
    const a = accounts.get(key) ?? { entity: f.entity_id, code: f.code, name: f.name, byMonth: new Map() };
    a.byMonth.set(f.month, (a.byMonth.get(f.month) ?? 0n) + decimalToPaise(f.amount));
    accounts.set(key, a);
  }
  for (const a of accounts.values()) {
    const scope = entityName.get(a.entity) ?? "Unknown";
    const found = spendingAnomaly({ scope, code: a.code, name: a.name, months: months.map((m) => a.byMonth.get(m) ?? 0n) },
      `/portal/books?e=${a.entity}&from=${lastMonth}-01&to=${lastMonthEnd}`, lastMonth);
    if (found) insights.push(found);
  }

  const groupRunway = runway(groupCash, groupNets);
  const scopes: Scope[] = [
    { key: "group", label: (await workspaceContext()).view === "all" ? "Whole group" : `All of ${workspaceLabel((await workspaceContext()).view)}`, kind: "group" },
    ...entities.map((e) => ({ key: `e:${e.name}`, label: e.name, kind: "entity" as const })),
    ...[...byVenture.values()].map((v) => ({ key: `v:${v.name}`, label: v.name, kind: "venture" as const })),
  ];
  return {
    insights: sortInsights(insights),
    scopes,
    lastMonth,
    burnMonths,
    group: {
      cash: groupCash,
      burn: groupRunway.burn,
      runwayMonths: groupRunway.months,
      overdue: overdue.reduce((s, o) => s + decimalToPaise(o.outstanding), 0n),
      overdueCount: overdue.length,
    },
  };
}

/** Whether an insight belongs to a scope chosen on the page. Receivables name every entity that billed. */
export function inScope(i: Insight, key: string) {
  if (key === "group") return true;
  const name = key.slice(2);
  return i.scope === name || i.scope.split(", ").includes(name);
}
