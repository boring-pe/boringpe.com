import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { dealStepsFor } from "@/lib/workflows";
import { StepDots } from "../_shell/workflow";
import { FilterBar } from "../_shell/filter-bar";
import { DEAL_NOTICES } from "@/lib/notices";
import { listDeals, listParties } from "@/lib/ops";
import { PARTY_KINDS, PILLARS, STAGES, inr, pillarLabel, stageLabel } from "@/lib/ops-fields";
import { addDeal, addParty, moveDeal } from "./actions";
import { Handshake } from "lucide-react";
import { EmptyState } from "../_shell/status";
import { SubmitButton } from "../_shell/buttons";

const NOTICES = DEAL_NOTICES;
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireSection("deals");
  const { notice } = await searchParams;
  const [deals, parties] = await Promise.all([listDeals(), listParties()]);
  // Deals at Closing or beyond show how far their workflow has come.
  const flows = await dealStepsFor(deals.filter((d) => d.stage === "closing" || d.stage === "closed").map((d) => d.id));
  const banner = notice ? NOTICES[notice] : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Deal Pipeline</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Every deal sits under one of the four pillars. Moving a deal to Closing or Closed needs the
          Super Admin&apos;s approval.
        </p>
      </div>

      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
          {banner.text}
        </p>
      ) : null}

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Add a deal</h3>
        <form id="add" action={addDeal} className="grid gap-3 md:grid-cols-4 scroll-mt-28">
          <input name="name" required minLength={2} maxLength={140} placeholder="Deal name" className={input} />
          <select name="pillar" defaultValue="build" className={input} aria-label="Pillar">
            {PILLARS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select name="partyId" defaultValue="" className={input} aria-label="Party">
            <option value="">No party yet</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input name="value" inputMode="decimal" placeholder="Value in ₹ (optional)" className={input} />
          <input name="notes" maxLength={1000} placeholder="Notes (optional)" className={`${input} md:col-span-3`} />
          <SubmitButton pending="Adding…" className={btn}>Add deal</SubmitButton>
        </form>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Deals ({deals.length})</h3>
        </div>
        {deals.length === 0 ? (
          <div className="p-6"><EmptyState compact icon={Handshake} title="No deals yet" body="Add the first opportunity and move it through the stages as it progresses." action={{ label: "Add a deal", href: "#add" }} /></div>
        ) : (
          <>
          <FilterBar list="deals" placeholder="Search deals, parties, notes" noun={["deal", "deals"]} chips={[...STAGES.map((s) => ({ id: s.id, label: s.label })), { id: "waiting", label: "Awaiting approval" }]} />
          <ul className="divide-y divide-slate-800/80" data-filter-list="deals">
            {deals.map((d) => (
              <li key={d.id} className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-deal={d.name} data-row data-tags={`${d.stage} ${d.pillar}${d.pending_stage ? " waiting" : ""}`}>
                <div className="min-w-0 flex-1">
                  <Link href={`/portal/deals/${d.id}`} className="font-medium text-white hover:text-blue-300" data-deal-link>{d.name}</Link>
                  <div className="text-xs text-slate-500">
                    {pillarLabel(d.pillar)} · {d.party_id ? <Link href={`/portal/parties/${d.party_id}`} className="hover:text-slate-300">{d.party_name}</Link> : "No party"} · {inr(d.value)}
                  </div>
                  {flows.get(d.id) ? <div className="mt-1.5"><StepDots steps={flows.get(d.id)!} label={`${d.name} workflow`} /></div> : null}
                  {d.notes ? <div className="mt-1 text-xs text-slate-400">{d.notes}</div> : null}
                </div>
                <div className="text-sm text-slate-300">
                  {stageLabel(d.stage)}
                  {d.pending_stage ? (
                    <span className="ml-2 text-xs text-amber-400">to {stageLabel(d.pending_stage)} awaiting approval</span>
                  ) : null}
                </div>
                <form action={moveDeal} className="flex items-center gap-2">
                  <input type="hidden" name="dealId" value={d.id} />
                  <select name="stage" defaultValue={d.stage} aria-label={`Stage for ${d.name}`} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white">
                    {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <button type="submit" className="text-xs font-semibold text-blue-400 hover:text-blue-300">Move</button>
                </form>
              </li>
            ))}
          </ul>
          </>
        )}
      </section>

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Parties ({parties.length})</h3>
        <form action={addParty} className="grid gap-3 md:grid-cols-4 mb-4">
          <input name="name" required minLength={2} maxLength={120} placeholder="Company, person, fund or vendor" className={input} />
          <select name="kind" defaultValue="company" className={input} aria-label="Kind">
            {PARTY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input name="email" type="email" maxLength={254} placeholder="Email (optional)" className={input} />
          <SubmitButton pending="Adding…" className={btn}>Add party</SubmitButton>
        </form>
        <ul className="text-sm text-slate-300 space-y-1">
          {parties.map((p) => (
            <li key={p.id}><Link href={`/portal/parties/${p.id}`} className="hover:text-white">{p.name}</Link> <span className="text-xs text-slate-500">{p.kind}{p.email ? ` · ${p.email}` : ""}</span></li>
          ))}
        </ul>
        {parties.length ? <Link href="/portal/parties" className="mt-3 inline-flex text-xs text-blue-400 hover:text-blue-300">All contacts, with their deals, invoices and KYC</Link> : null}
      </section>
    </div>
  );
}
