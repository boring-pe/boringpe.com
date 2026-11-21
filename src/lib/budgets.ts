import { getSql } from "./db";
import { balanceOf, paiseToDecimal } from "./accounting";
import { balances, decimalToPaise } from "./books";
import { fyMonths, spreadAnnual } from "./assets-calc";

/** Sets an account's budget for a financial year: the annual amount spread over twelve months. */
export async function setAnnualBudget(entityId: string, accountId: string, fyStartYear: number, annual: bigint, by: string) {
  const sql = await getSql();
  const ok = (await sql.query(
    "select 1 from ledger_accounts where id = $1 and entity_id = $2 and type in ('income', 'expense')",
    [accountId, entityId],
  )).length > 0;
  if (!ok) return false;
  const months = fyMonths(fyStartYear);
  const amounts = spreadAnnual(annual);
  await sql.tx(async (db) => {
    for (const [i, m] of months.entries()) {
      await db.query(
        `insert into budgets (account_id, month, amount, updated_by) values ($1, $2::date, $3, $4)
         on conflict (account_id, month) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now()`,
        [accountId, m, paiseToDecimal(amounts[i]), by],
      );
    }
  });
  return true;
}

/** Fills this year's budget from last year's actuals for every income and expense account that had any. */
export async function budgetFromLastYear(entityId: string, fyStartYear: number, by: string) {
  const rows = await balances(entityId, `${fyStartYear - 1}-04-01`, `${fyStartYear}-03-31`);
  let n = 0;
  for (const r of rows) {
    if (r.type !== "income" && r.type !== "expense") continue;
    const amount = balanceOf(r);
    if (amount <= 0n) continue;
    if (await setAnnualBudget(entityId, r.id, fyStartYear, amount, by)) n += 1;
  }
  return n;
}

/** Budget against actual for income and expense accounts over a date range (whole months). */
export async function budgetVsActual(entityId: string, from: string, to: string) {
  const sql = await getSql();
  const budget = await sql.query<{ account_id: string; amount: string }>(
    `select b.account_id, sum(b.amount)::text as amount from budgets b join ledger_accounts a on a.id = b.account_id
      where a.entity_id = $1 and b.month between date_trunc('month', $2::date)::date and $3::date group by b.account_id`,
    [entityId, from, to],
  );
  const actual = await balances(entityId, from, to);
  const byId = new Map(budget.map((b) => [b.account_id, decimalToPaise(b.amount)]));
  const lines = actual
    .filter((r) => r.type === "income" || r.type === "expense")
    .map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, budget: byId.get(r.id) ?? 0n, actual: balanceOf(r) }))
    .filter((l) => l.budget !== 0n || l.actual !== 0n)
    .map((l) => ({
      ...l,
      // Favourable: income above budget, or spending below it.
      variance: l.type === "income" ? l.actual - l.budget : l.budget - l.actual,
      used: l.budget > 0n ? Number((l.actual * 1000n) / l.budget) / 10 : null,
    }));
  const sum = (t: "income" | "expense", k: "budget" | "actual") => lines.filter((l) => l.type === t).reduce((s, l) => s + l[k], 0n);
  return {
    lines,
    income: { budget: sum("income", "budget"), actual: sum("income", "actual") },
    expense: { budget: sum("expense", "budget"), actual: sum("expense", "actual") },
  };
}
