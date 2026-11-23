import { requireSection } from "@/lib/dal";
import { entityKindLabel, rupees } from "@/lib/accounting";
import { fiscalYearOf } from "@/lib/hr-calc";
import { misReport } from "@/lib/mis";
import { barPercent } from "@/lib/mis-calc";
import { pillarLabel } from "@/lib/ops-fields";

const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";
const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireSection("reports");
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const [fyFrom, fyTo] = fiscalYearOf(today);
  const from = isDate(sp.from) ?? fyFrom;
  const to = isDate(sp.to) ?? fyTo;
  const r = await misReport(from, to);
  const max = r.months.reduce((m, x) => (x.income > m ? x.income : x.expense > m ? x.expense : m), 0n);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">MIS reports</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          The whole group from the books, for {from} to {to}. Business Studio fees between our own entities are removed from group income and expenses.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">From<input name="from" type="date" defaultValue={from} className={`${input} mt-1`} /></label>
        <label className="text-xs text-slate-500">To<input name="to" type="date" defaultValue={to} className={`${input} mt-1`} /></label>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Update</button>
        <a href={`/portal/reports/export?from=${from}&to=${to}`} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white">Download CSV</a>
      </form>

      <div className="grid gap-4 md:grid-cols-4" data-group>
        {[["Group income", r.group.income], ["Group expenses", r.group.expense], [r.group.net >= 0n ? "Group profit" : "Group loss", r.group.net], ["Group cash", r.group.cash]].map(([label, v]) => (
          <div key={label as string} className={`${card} p-5`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label as string}</div>
            <div className="mt-1 text-xl font-semibold text-white">{rupees(v as bigint)}</div>
          </div>
        ))}
      </div>

      <section className={`${card} overflow-x-auto`}>
        <h3 className="px-3 pt-3 text-sm font-semibold text-white">By entity</h3>
        <table className="w-full">
          <thead><tr><th className={th}>Entity</th><th className={`${th} text-right`}>Income</th><th className={`${th} text-right`}>Expenses</th><th className={`${th} text-right`}>Profit</th><th className={`${th} text-right`}>Cash</th><th className={`${th} text-right`}>Assets</th><th className={`${th} text-right`}>Liabilities</th></tr></thead>
          <tbody>
            {r.perEntity.map((e) => (
              <tr key={e.id} className="border-t border-slate-800" data-entity-row={e.name}>
                <td className={td}>{e.name}<div className="text-xs text-slate-500">{entityKindLabel(e.kind)}</div></td>
                <td className={num}>{rupees(e.income)}</td><td className={num}>{rupees(e.expense)}</td><td className={num}>{rupees(e.net)}</td>
                <td className={num}>{rupees(e.cash)}</td><td className={num}>{rupees(e.assets)}</td><td className={num}>{rupees(e.liabilities)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-700" data-entity-row="Fees between our entities">
              <td className={td}>Less: fees between our entities</td><td className={num}>−{rupees(r.intercompany)}</td><td className={num}>−{rupees(r.intercompany)}</td><td className={num} colSpan={4}></td>
            </tr>
            <tr className="border-t border-slate-700 font-semibold" data-entity-row="Group">
              <td className={td}>Group</td><td className={num}>{rupees(r.group.income)}</td><td className={num}>{rupees(r.group.expense)}</td><td className={num}>{rupees(r.group.net)}</td>
              <td className={num}>{rupees(r.group.cash)}</td><td className={num}>{rupees(r.group.assets)}</td><td className={num}>{rupees(r.group.liabilities)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-1">Month by month</h3>
        <p className="text-xs text-slate-500 mb-4"><span className="inline-block h-2 w-3 rounded-sm bg-blue-500 align-middle" /> Income <span className="ml-3 inline-block h-2 w-3 rounded-sm bg-slate-500 align-middle" /> Expenses</p>
        <div className="space-y-2">
          {r.months.map((m) => (
            <div key={m.month} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 text-xs" data-month={m.month}>
              <span className="text-slate-400">{m.month}</span>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><div className="h-2 rounded-sm bg-blue-500" style={{ width: `${barPercent(m.income, max)}%` }} /><span className="text-slate-400 tabular-nums">{m.income ? rupees(m.income) : ""}</span></div>
                <div className="flex items-center gap-2"><div className="h-2 rounded-sm bg-slate-500" style={{ width: `${barPercent(m.expense, max)}%` }} /><span className="text-slate-400 tabular-nums">{m.expense ? rupees(m.expense) : ""}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={`${card} overflow-x-auto`}>
          <h3 className="px-3 pt-3 text-sm font-semibold text-white">Ventures by vertical</h3>
          <table className="w-full">
            <thead><tr><th className={th}>Vertical</th><th className={`${th} text-right`}>Revenue</th><th className={`${th} text-right`}>Fee</th><th className={`${th} text-right`}>Operators</th><th className={`${th} text-right`}>Net</th></tr></thead>
            <tbody>
              {r.ventures.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-sm text-slate-500">No months closed in this range.</td></tr> : r.ventures.map((v) => (
                <tr key={v.pillar} className="border-t border-slate-800" data-vertical={v.pillar}>
                  <td className={td}>{pillarLabel(v.pillar)}<div className="text-xs text-slate-500">{v.months} venture-months</div></td>
                  <td className={num}>{rupees(v.revenue)}</td><td className={num}>{rupees(v.fee)}</td><td className={num}>{rupees(v.operators)}</td><td className={num}>{rupees(v.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={`${card} overflow-x-auto`}>
          <h3 className="px-3 pt-3 text-sm font-semibold text-white">Holdings by vertical (to date)</h3>
          <table className="w-full">
            <thead><tr><th className={th}>Vertical</th><th className={`${th} text-right`}>Holdings</th><th className={`${th} text-right`}>Invested</th><th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>Returned</th></tr></thead>
            <tbody>
              {r.holdings.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-sm text-slate-500">No holdings.</td></tr> : r.holdings.map((h) => (
                <tr key={h.pillar} className="border-t border-slate-800" data-holdings={h.pillar}>
                  <td className={td}>{pillarLabel(h.pillar)}</td><td className={num}>{h.count}</td><td className={num}>{rupees(h.invested)}</td><td className={num}>{rupees(h.value)}</td><td className={num}>{rupees(h.returned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[["Active people", String(r.headcount)], ["Payroll (gross) in range", rupees(r.payroll)], [`Impact Marrow contributions (${r.impact.count})`, rupees(r.impact.amount)]].map(([label, v]) => (
          <div key={label} className={`${card} p-5`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold text-white">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
