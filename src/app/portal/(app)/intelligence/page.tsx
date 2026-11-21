import Link from "next/link";
import { AlertTriangle, Flame, Receipt, Wallet } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { AREA_LABEL, countBySeverity, inr, monthLabel, type Area } from "@/lib/insights-calc";
import { firmInsights, inScope } from "@/lib/insights";
import { InsightList } from "./insight-list";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";
const AREAS: Area[] = ["cash", "receivables", "budget", "ventures", "spending"];

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<{ scope?: string; area?: string }> }) {
  await requireSection("intelligence");
  const sp = await searchParams;
  const data = await firmInsights();
  const scope = data.scopes.find((s) => s.key === sp.scope) ?? data.scopes[0];
  const area = AREAS.find((a) => a === sp.area);
  const scoped = data.insights.filter((i) => inScope(i, scope.key));
  const shown = area ? scoped.filter((i) => i.area === area) : scoped;
  const counts = countBySeverity(scoped);
  const attention = counts.critical + counts.warning;
  const link = (next: { scope?: string; area?: string }) => {
    const q = new URLSearchParams();
    const s = next.scope ?? scope.key;
    const a = "area" in next ? next.area : area;
    if (s !== "group") q.set("scope", s);
    if (a) q.set("area", a);
    const qs = q.toString();
    return `/portal/intelligence${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`;
  const g = data.group;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Insights</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          The intelligence layer of the Business Stack: what the books, invoices, budgets and venture statements say, in plain words.
          Worked out from records kept in the portal, through {monthLabel(data.lastMonth)}; nothing is estimated.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-intel-kpis>
        <div className={`${card} p-5`} data-kpi="runway">
          <div className="flex items-center justify-between"><span className={label}>Group runway</span><Wallet className="h-4 w-4 text-slate-500" /></div>
          <div className={`mt-2 text-2xl font-semibold ${g.runwayMonths !== null && g.runwayMonths < 6 ? "text-amber-400" : "text-white"}`}>
            {g.runwayMonths === null ? "Not burning" : `${g.runwayMonths.toFixed(1)} months`}
          </div>
          <div className="text-xs text-slate-500">{inr(g.cash)} in bank, cash and gateway</div>
        </div>
        <div className={`${card} p-5`} data-kpi="burn">
          <div className="flex items-center justify-between"><span className={label}>Monthly burn</span><Flame className="h-4 w-4 text-slate-500" /></div>
          <div className="mt-2 text-2xl font-semibold text-white">{g.burn > 0n ? inr(g.burn) : "₹0"}</div>
          <div className="text-xs text-slate-500">Average of {monthLabel(data.burnMonths[0])} to {monthLabel(data.burnMonths.at(-1)!)}</div>
        </div>
        <Link href="/portal/invoices?view=receivables" className={`${card} block p-5`} data-kpi="overdue">
          <div className="flex items-center justify-between"><span className={label}>Overdue receivables</span><Receipt className="h-4 w-4 text-slate-500" /></div>
          <div className={`mt-2 text-2xl font-semibold ${g.overdue > 0n ? "text-amber-400" : "text-white"}`}>{inr(g.overdue)}</div>
          <div className="text-xs text-slate-500">{g.overdueCount ? `${g.overdueCount} invoice${g.overdueCount === 1 ? "" : "s"} past due` : "Nothing past due"}</div>
        </Link>
        <div className={`${card} p-5`} data-kpi="attention">
          <div className="flex items-center justify-between"><span className={label}>Needs attention</span><AlertTriangle className="h-4 w-4 text-slate-500" /></div>
          <div className={`mt-2 text-2xl font-semibold ${counts.critical ? "text-red-400" : "text-white"}`}>{attention}</div>
          <div className="text-xs text-slate-500">{counts.critical} to act on now · {counts.warning} to watch</div>
        </div>
      </div>

      <div className="space-y-3">
        <nav aria-label="Scope" className="flex flex-wrap gap-2">
          {data.scopes.map((s) => {
            const n = data.insights.filter((i) => inScope(i, s.key) && (i.severity === "critical" || i.severity === "warning")).length;
            return (
              <Link key={s.key} href={link({ scope: s.key })} className={chip(s.key === scope.key)} data-scope={s.label}>
                {s.label}{s.kind === "venture" ? <span className="ml-1 text-xs text-slate-500">venture</span> : null}
                {n ? <span className="ml-1.5 rounded-full bg-amber-400/15 px-1.5 text-xs text-amber-400">{n}</span> : null}
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Area" className="flex flex-wrap gap-2">
          <Link href={link({ area: undefined })} className={chip(!area)}>Everything</Link>
          {AREAS.map((a) => <Link key={a} href={link({ area: a })} className={chip(area === a)}>{AREA_LABEL[a]}</Link>)}
        </nav>
      </div>

      <section className={card} data-insights>
        {shown.length ? (
          <InsightList items={shown} />
        ) : (
          <div className="p-10 text-center">
            <h3 className="text-base font-semibold text-white">Nothing to flag</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              {data.insights.length
                ? "No insights for this choice. Try the whole group or another area."
                : "Insights appear once the books, invoices, budgets or venture statements have a few months of records."}
            </p>
          </div>
        )}
      </section>

      <details className="text-sm text-slate-400">
        <summary className="cursor-pointer text-slate-300">How these are worked out</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Runway: cash in bank, cash and payment gateway accounts, divided by the average amount expenses ran above income over the last three whole months. Depreciation is left out because no cash moves. Under three months is flagged to act on, under six to watch.</li>
          <li>Receivables: issued invoices past their due date, per customer. Over 60 days late is flagged to act on, over 30 to watch.</li>
          <li>Budget: this financial year to the end of last month. Income more than 10% short of budget, or spending more than 10% over it.</li>
          <li>Ventures: the latest closed monthly statement against the average of up to three months before it (a fall of 20% or more, or a rise of 20% or more), a monthly loss, or last month not yet closed.</li>
          <li>Unusual spending: an expense account whose last month was at least one and a half times its usual month and at least ₹10,000 higher, with two or more earlier months of spending to compare against.</li>
        </ul>
      </details>
    </div>
  );
}
