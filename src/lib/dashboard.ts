import { getSql } from "./db";
import { decimalToPaise } from "./books";
import { entityIdsInView, workspaceContext } from "./workspaces";
import { fiscalYearOf } from "./hr-calc";
import { fillMonths, monthsBetween } from "./mis-calc";
import { addMonths, bucketKeys, type Bucket, type Range } from "./dashboard-calc";

/** Group cash (bank, cash, payment gateway) at the end of each of the last `n` months. */
export async function cashTrend(n = 12) {
  const sql = await getSql();
  const rows = await sql.query<{ month: string; cash: string }>(
    `with m as (
       select (date_trunc('month', current_date) - (g || ' months')::interval)::date as start from generate_series(0, $1 - 1) g
     )
     select to_char(m.start, 'YYYY-MM') as month,
            coalesce((select sum(l.debit - l.credit) from journal_lines l join journal_entries e on e.id = l.entry_id
                        join ledger_accounts a on a.id = l.account_id
                       where a.code in ('1010', '1020', '1030') and a.entity_id = any($2::text[])
                         and e.entry_date < (m.start + interval '1 month')::date), 0)::text as cash
       from m order by m.start`,
    [n, await entityIdsInView()],
  );
  return rows.map((r) => ({ month: r.month, cash: decimalToPaise(r.cash) }));
}

/** Group income and expenses per month this financial year, with fees between our own entities taken out. */
export async function fyMonthly(today = new Date().toISOString().slice(0, 10)) {
  const [from, to] = fiscalYearOf(today);
  const sql = await getSql();
  const rows = await sql.query<{ month: string; income: string; expense: string }>(
    `select to_char(e.entry_date, 'YYYY-MM') as month,
            coalesce(sum(l.credit - l.debit) filter (where a.type = 'income' and e.source_type <> 'venture_fee'), 0)::text as income,
            coalesce(sum(l.debit - l.credit) filter (where a.type = 'expense' and a.code <> '5100'), 0)::text as expense
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where e.entry_date between $1::date and $2::date and a.type in ('income', 'expense') and a.entity_id = any($3::text[]) group by 1`,
    [from, to, await entityIdsInView()],
  );
  const months = monthsBetween(from, today < to ? today : to);
  return {
    from,
    months: fillMonths(months, rows.map((r) => ({ month: r.month, income: decimalToPaise(r.income), expense: decimalToPaise(r.expense) })),
      (month) => ({ month, income: 0n, expense: 0n })),
  };
}

export async function receivablesTotals() {
  const sql = await getSql();
  const r = (await sql.query<{ due: string; overdue: string; n: number }>(
    `select coalesce(sum(total - received - tds), 0)::text as due,
            coalesce(sum(total - received - tds) filter (where due_date < current_date), 0)::text as overdue,
            count(*) filter (where due_date < current_date)::int as n
       from invoices where status = 'issued' and entity_id = any($1::text[])`,
    [await entityIdsInView()],
  ))[0];
  return { due: decimalToPaise(r.due), overdue: decimalToPaise(r.overdue), overdueCount: r.n };
}

/** What is coming up for this person: their open tasks due within a week (or overdue). */
export async function myUpcomingTasks(userId: string) {
  const sql = await getSql();
  return sql.query<{ id: string; title: string; due_date: string | null; overdue: boolean }>(
    `select id, title, due_date::text, (due_date < current_date) as overdue from tasks
      where not done and (assignee_id = $1 or (assignee_id is null and created_by = $1))
        and (due_date is null or due_date <= current_date + 7) and workspace = any($2::text[])
      order by due_date nulls last limit 6`,
    [userId, (await workspaceContext()).inView],
  );
}

/** Cash (bank, cash, payment gateway) in each workspace this person may enter, for the combined view. */
export async function cashByWorkspace() {
  const { enterable } = await workspaceContext();
  const sql = await getSql();
  const rows = await sql.query<{ workspace: string; cash: string }>(
    `select en.workspace, coalesce(sum(l.debit - l.credit), 0)::text as cash
       from entities en left join ledger_accounts a on a.entity_id = en.id and a.code in ('1010', '1020', '1030')
       left join journal_lines l on l.account_id = a.id
      where en.workspace = any($1::text[]) group by en.workspace`,
    [enterable],
  );
  return enterable.map((w) => ({ workspace: w, cash: decimalToPaise(rows.find((r) => r.workspace === w)?.cash ?? "0") }));
}

/** Income and expenses (fees between our own entities taken out) for each day or month from `from` to `to`. */
async function flowRows(from: string, to: string, bucket: Bucket) {
  const sql = await getSql();
  const fmt = bucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  const rows = await sql.query<{ k: string; income: string; expense: string }>(
    `select to_char(e.entry_date, '${fmt}') as k,
            coalesce(sum(l.credit - l.debit) filter (where a.type = 'income' and e.source_type <> 'venture_fee'), 0)::text as income,
            coalesce(sum(l.debit - l.credit) filter (where a.type = 'expense' and a.code <> '5100'), 0)::text as expense
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where e.entry_date between $1::date and $2::date and a.type in ('income', 'expense') and a.entity_id = any($3::text[]) group by 1`,
    [from, to, await entityIdsInView()],
  );
  return new Map(rows.map((r) => [r.k, { income: decimalToPaise(r.income), expense: decimalToPaise(r.expense) }]));
}

/**
 * The figures behind the period picker: each day or month of the period with the same bucket a
 * year earlier, and the totals of the span it is compared with.
 */
export async function periodFlows(range: Range) {
  const lastYear = (d: string) => addMonths(d, -12);
  const [now, before, prev] = await Promise.all([
    flowRows(range.from, range.to, range.bucket),
    flowRows(lastYear(range.from), lastYear(range.to), range.bucket),
    flowRows(range.prevFrom, range.prevTo, "month"),
  ]);
  const shift = (k: string) => (k.length === 10 ? lastYear(k) : lastYear(`${k}-01`).slice(0, 7));
  const buckets = bucketKeys(range.from, range.to, range.bucket).map((key) => {
    const n = now.get(key), b = before.get(shift(key));
    return { key, income: n?.income ?? 0n, expense: n?.expense ?? 0n, lastYearIncome: b?.income ?? 0n };
  });
  const sum = (m: Map<string, { income: bigint; expense: bigint }>, f: "income" | "expense") => [...m.values()].reduce((s, x) => s + x[f], 0n);
  return {
    buckets,
    income: sum(now, "income"),
    expense: sum(now, "expense"),
    prevIncome: sum(prev, "income"),
    prevExpense: sum(prev, "expense"),
  };
}

/** The latest things done in the portal, for the dashboard's activity tab. */
export async function recentActivity(limit = 8) {
  const sql = await getSql();
  return sql.query<{ id: string; actor_email: string | null; action: string; detail: string | null; at: string }>(
    `select id::text, actor_email, action, detail, to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as at
       from access_audit order by created_at desc, id desc limit $1`,
    [limit],
  );
}
