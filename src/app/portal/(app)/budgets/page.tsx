import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { listAccounts, listEntities } from "@/lib/books";
import { budgetVsActual } from "@/lib/budgets";
import { canPostBooks } from "@/lib/rbac";
import { copyLastYear, saveBudget } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  saved: { text: "Budget saved, spread over the twelve months." },
  copied: { text: "This year's budget filled from last year's actuals." },
  nothing: { text: "Last year has no income or expenses to copy.", bad: true },
  invalid: { text: "That was not valid.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input = "rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ e?: string; fy?: string; to?: string; notice?: string }> }) {
  const user = await requireSection("budgets");
  const sp = await searchParams;
  const entities = await listEntities();
  const entity = entities.find((x) => x.id === sp.e) ?? entities[0];
  const today = new Date().toISOString().slice(0, 10);
  const [y, m] = today.split("-").map(Number);
  const currentFy = m >= 4 ? y : y - 1;
  const fy = Number(sp.fy) >= 2000 && Number(sp.fy) <= 2100 ? Number(sp.fy) : currentFy;
  const from = `${fy}-04-01`;
  const fyEnd = `${fy + 1}-03-31`;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : fy === currentFy ? today : fyEnd;
  const [report, accounts] = await Promise.all([budgetVsActual(entity.id, from, to), listAccounts(entity.id)]);
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const post = canPostBooks(user.role);
  const tone = (v: bigint) => (v < 0n ? "text-red-400" : "text-green-400");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Budgets</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">A yearly budget per income and expense account, against what the books show. Green is favourable: income above budget or spending below it.</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}
      <nav aria-label="Entities" className="flex flex-wrap gap-2">
        {entities.map((x) => <Link key={x.id} href={`/portal/budgets?e=${x.id}&fy=${fy}`} className={`rounded-full border px-3 py-1 text-sm ${x.id === entity.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>{x.name}</Link>)}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="e" value={entity.id} />
        <select name="fy" defaultValue={fy} className={input} aria-label="Financial year">
          {[currentFy - 1, currentFy, currentFy + 1].map((v) => <option key={v} value={v}>FY {v}-{String((v + 1) % 100).padStart(2, "0")}</option>)}
        </select>
        <label className="text-xs text-slate-500">Actuals up to<input name="to" type="date" defaultValue={to} className={`${input} mt-1 block`} /></label>
        <button className={btn}>Show</button>
      </form>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Account</th><th className={`${th} text-right`}>Budget to date</th><th className={`${th} text-right`}>Actual</th><th className={`${th} text-right`}>Variance</th><th className={`${th} text-right`}>Used</th></tr></thead>
          <tbody>
            {report.lines.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">No budget or activity for this year yet.</td></tr> : report.lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-800" data-budget={l.name}>
                <td className={td}>{l.code} {l.name}<div className="text-xs capitalize text-slate-500">{l.type}</div></td>
                <td className={num}>{rupees(l.budget)}</td><td className={num}>{rupees(l.actual)}</td>
                <td className={`${num} ${tone(l.variance)}`}>{rupees(l.variance)}</td><td className={num}>{l.used === null ? "–" : `${l.used.toFixed(1)}%`}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-700 font-semibold"><td className={td}>Income</td><td className={num}>{rupees(report.income.budget)}</td><td className={num}>{rupees(report.income.actual)}</td><td className={`${num} ${tone(report.income.actual - report.income.budget)}`}>{rupees(report.income.actual - report.income.budget)}</td><td /></tr>
            <tr className="font-semibold"><td className={td}>Expenses</td><td className={num}>{rupees(report.expense.budget)}</td><td className={num}>{rupees(report.expense.actual)}</td><td className={`${num} ${tone(report.expense.budget - report.expense.actual)}`}>{rupees(report.expense.budget - report.expense.actual)}</td><td /></tr>
          </tbody>
        </table>
      </section>
      {post ? (
        <section className={`${card} p-6 space-y-4`}>
          <h3 className="text-sm font-semibold text-white">Set FY {fy}-{String((fy + 1) % 100).padStart(2, "0")} budget for {entity.name}</h3>
          <form action={saveBudget} className="flex flex-wrap gap-3">
            <input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="fy" value={fy} />
            <select name="accountId" className={input} aria-label="Account">
              {accounts.filter((a) => a.active && (a.type === "income" || a.type === "expense")).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <input name="annual" required inputMode="decimal" placeholder="Amount for the year ₹" className={input} />
            <button className={btn}>Save</button>
          </form>
          <form action={copyLastYear}>
            <input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="fy" value={fy} />
            <button className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white">Fill from last year&apos;s actuals</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
