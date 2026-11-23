import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Hammer, Handshake, Landmark, Sparkle } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { decimalToPaise } from "@/lib/books";
import { firmInsights } from "@/lib/insights";
import { VERTICALS, verticalBySlug, type Vertical } from "@/lib/ops-fields";
import { can, type SectionId } from "@/lib/rbac";
import { verticalFigures, verticalRecords } from "@/lib/verticals";
import { InsightList } from "../../intelligence/insight-list";

const SECTION: Record<Vertical, SectionId> = { build: "v_build", co_build: "v_co_build", own: "v_own", enable: "v_studio" };
const ICON: Record<Vertical, React.ElementType> = { build: Hammer, co_build: Handshake, own: Landmark, enable: Sparkle };
const card = "rounded-xl border border-slate-800 bg-slate-900";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";
const th = "px-4 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-4 py-2 text-sm text-slate-300";

function Kpi({ name, value, note, k }: { name: string; value: string; note?: string; k: string }) {
  return (
    <div className={`${card} p-5`} data-kpi={k}>
      <div className={label}>{name}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</div>
      {note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

/** One vertical: its businesses, money, pipeline and work. Boring Studio also sees every vertical side by side. */
export default async function VerticalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = verticalBySlug(slug);
  if (!v) notFound();
  const user = await requireSection(SECTION[v.id]);
  const [figures, records, intel] = await Promise.all([verticalFigures(), verticalRecords(v.id), can(user.role, "intelligence") ? firmInsights() : Promise.resolve(null)]);
  const f = figures.find((x) => x.vertical === v.id)!;
  const Icon = ICON[v.id];
  const studio = v.id === "enable";
  const names = new Set(records.ventures.flatMap((x) => [x.name, x.entity_name]));
  const insights = (intel?.insights ?? []).filter((i) => (studio ? i.severity === "critical" || i.severity === "warning" : names.has(i.scope))).slice(0, 6);

  return (
    <div className="space-y-6" data-vertical={v.id}>
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-400"><Icon className="h-4 w-4" />Vertical</div>
        <h2 className="mt-2 text-2xl font-bold text-white">{v.label}{studio ? <span className="ml-2 text-base font-normal text-slate-500">Enable</span> : null}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">{v.note}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-vertical-kpis>
        {v.id === "own" ? (
          <>
            <Kpi k="holdings" name="Holdings" value={String(f.holdings)} note="Active stakes" />
            <Kpi k="value" name="Current value" value={rupees(f.holdingsValue)} note={`Cost still held ${rupees(f.holdingsCost)}`} />
          </>
        ) : studio ? (
          <>
            <Kpi k="fees" name="Boring Studio fees" value={rupees(f.studioFees)} note="Charged to ventures this financial year" />
            <Kpi k="ventures" name="Ventures managed" value={String(figures.reduce((s, x) => s + x.ventures, 0))} note={(() => { const n = figures.reduce((s, x) => s + x.holdings, 0); return `${n} ${n === 1 ? "holding" : "holdings"}`; })()} />
          </>
        ) : (
          <>
            <Kpi k="ventures" name="Ventures" value={String(f.ventures)} note="Active" />
            <Kpi k="revenue" name="Venture revenue" value={rupees(f.ventureRevenue)} note={`Net to ventures ${rupees(f.ventureNet)}, this financial year`} />
          </>
        )}
        <Kpi k="billed" name="Billed" value={rupees(f.billed)} note={f.owed > 0n ? `${rupees(f.owed)} still owed` : "Nothing owed"} />
        <Kpi k="pipeline" name="Open deals and tasks" value={`${f.openDeals} · ${f.openTasks}`} note="Deals in the pipeline · open tasks" />
      </div>

      {studio ? (
        <section className={`${card} overflow-x-auto`} data-all-verticals>
          <div className="px-4 pt-4 text-sm font-semibold text-white">Every vertical, this financial year</div>
          <table className="mt-2 w-full">
            <thead><tr><th className={th}>Vertical</th><th className={th}>Ventures</th><th className={th}>Holdings</th><th className={th}>Billed</th><th className={th}>Owed</th><th className={th}>Money in</th><th className={th}>Money out</th><th className={th}>Open deals</th><th className={th}>Open tasks</th></tr></thead>
            <tbody>
              {figures.map((x) => {
                const meta = VERTICALS.find((y) => y.id === x.vertical)!;
                return (
                  <tr key={x.vertical} className="border-t border-slate-800" data-row={x.vertical}>
                    <td className={td}><Link href={`/portal/verticals/${meta.slug}`} className="font-medium text-white hover:text-blue-300">{meta.label}</Link></td>
                    <td className={td}>{x.ventures}</td><td className={td}>{x.holdings}</td>
                    <td className={`${td} tabular-nums`}>{rupees(x.billed)}</td><td className={`${td} tabular-nums`}>{rupees(x.owed)}</td>
                    <td className={`${td} tabular-nums`}>{rupees(x.moneyIn)}</td><td className={`${td} tabular-nums`}>{rupees(x.moneyOut)}</td>
                    <td className={td}>{x.openDeals}</td><td className={td}>{x.openTasks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 pb-4 pt-2 text-xs text-slate-500">Invoices and money take the vertical of the entity they belong to unless one is chosen; Boring PE&apos;s own records belong to Boring Studio.</p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {v.id === "own" ? (
          <section className={card} data-list="holdings">
            <div className="flex items-center justify-between px-4 pt-4"><h3 className="text-sm font-semibold text-white">Holdings</h3><Link href="/portal/portfolio" className="text-xs text-blue-400">Portfolio</Link></div>
            {records.holdings.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No holdings yet.</p> : (
              <ul className="mt-2 divide-y divide-slate-800">{records.holdings.map((h) => (
                <li key={h.id} className="flex justify-between px-4 py-2 text-sm"><span className="text-white">{h.name}<span className="ml-2 text-xs text-slate-500">{h.status}</span></span><span className="tabular-nums text-slate-300">{rupees(h.pos.currentValue)}</span></li>
              ))}</ul>
            )}
          </section>
        ) : (
          <section className={card} data-list="ventures">
            <div className="flex items-center justify-between px-4 pt-4"><h3 className="text-sm font-semibold text-white">{studio ? "Ventures it manages" : "Ventures"}</h3><Link href="/portal/ventures" className="text-xs text-blue-400">All ventures</Link></div>
            {records.ventures.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No ventures yet.</p> : null}
            <ul className="mt-2 divide-y divide-slate-800">{records.ventures.map((x) => (
              <li key={x.id} className="flex justify-between px-4 py-2 text-sm"><Link href={`/portal/ventures?v=${x.id}`} className="text-white hover:text-blue-300">{x.name}</Link><span className="text-xs text-slate-500">{studio ? `${x.pillar === "build" ? "Build" : "Co-Build"} · ` : ""}{x.entity_name} · {x.status}</span></li>
            ))}</ul>
          </section>
        )}

        <section className={card} data-list="deals">
          <div className="flex items-center justify-between px-4 pt-4"><h3 className="text-sm font-semibold text-white">Open deals</h3><Link href="/portal/deals" className="text-xs text-blue-400">Pipeline</Link></div>
          {records.deals.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">Nothing in the pipeline for {v.label}.</p> : (
            <ul className="mt-2 divide-y divide-slate-800">{records.deals.map((d) => (
              <li key={d.id} className="flex justify-between px-4 py-2 text-sm"><span className="text-white">{d.name}{d.party_name ? <span className="ml-2 text-xs text-slate-500">{d.party_name}</span> : null}</span><span className="text-xs capitalize text-slate-400">{d.stage.replace("_", " ")}</span></li>
            ))}</ul>
          )}
        </section>

        <section className={card} data-list="invoices">
          <div className="flex items-center justify-between px-4 pt-4"><h3 className="text-sm font-semibold text-white">Invoices</h3><Link href={`/portal/invoices?vertical=${v.id}`} className="text-xs text-blue-400">All {v.label} invoices</Link></div>
          {records.invoices.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No invoices yet.</p> : (
            <ul className="mt-2 divide-y divide-slate-800">{records.invoices.map((i) => (
              <li key={i.id} className="flex justify-between px-4 py-2 text-sm"><Link href={`/portal/invoices?inv=${i.id}`} className="text-white hover:text-blue-300">{i.number ?? "Draft"} · {i.party}</Link><span className="tabular-nums text-slate-300">{rupees(decimalToPaise(i.total))} <span className="text-xs text-slate-500">{i.status}</span></span></li>
            ))}</ul>
          )}
        </section>

        <section className={card} data-list="tasks">
          <div className="flex items-center justify-between px-4 pt-4"><h3 className="text-sm font-semibold text-white">Open tasks</h3><Link href={`/portal/tasks?vertical=${v.id}`} className="text-xs text-blue-400">Tasks</Link></div>
          {records.tasks.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No open tasks for {v.label}.</p> : (
            <ul className="mt-2 divide-y divide-slate-800">{records.tasks.map((t) => (
              <li key={t.id} className="flex justify-between px-4 py-2 text-sm"><span className="text-white">{t.title}</span><span className="text-xs text-slate-500">{t.due_date ?? ""}{t.assignee_email ? ` · ${t.assignee_email}` : ""}</span></li>
            ))}</ul>
          )}
        </section>
      </div>

      {insights.length ? (
        <section className={card} data-list="insights">
          <div className="flex items-center justify-between px-4 pt-4"><h3 className="text-sm font-semibold text-white">{studio ? "Needs attention across Boring PE" : "Insights"}</h3><Link href="/portal/intelligence" className="inline-flex items-center gap-1 text-xs text-blue-400">All insights<ArrowRight className="h-3 w-3" /></Link></div>
          <InsightList items={insights} compact />
        </section>
      ) : null}
    </div>
  );
}
