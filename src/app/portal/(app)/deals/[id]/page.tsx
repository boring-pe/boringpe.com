import Link from "next/link";
import { notFound } from "next/navigation";
import { Contact, FileText, ListChecks, Receipt, Wallet } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getSql } from "@/lib/db";
import { rupees } from "@/lib/accounting";
import { decimalToPaise } from "@/lib/books";
import { RECORD_NOTICES } from "@/lib/notices";
import { getDeal, listAssignees, listParties } from "@/lib/ops";
import { inr, pillarLabel, stageLabel, STAGES } from "@/lib/ops-fields";
import { can } from "@/lib/rbac";
import { DOC_CATEGORIES } from "@/lib/vault-fields";
import { dealFacts, dealLinks } from "@/lib/workflows";
import { dealSteps, pathOf, PATH_LABEL } from "@/lib/workflows-calc";
import { todayIST } from "@/lib/dashboard-calc";
import { moveDeal } from "../actions";
import { addRecordTask, attachRecordDoc, linkDealParty, startPartyKyc } from "../record-actions";
import { WorkflowSteps } from "../../_shell/workflow";
import { DueChip, EmptyState, StatusChip, dueState } from "../../_shell/status";
import { SubmitButton } from "../../_shell/buttons";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700";
const h3 = "flex items-center gap-2 text-sm font-semibold text-white";

/**
 * One deal and everything it led to: where it is in its workflow, and the invoices, money,
 * holding or venture, tasks and documents linked to it. Every next step is one click from here.
 */
export default async function DealRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const user = await requireSection("deals");
  const { id } = await params;
  const { notice } = await searchParams;
  const deal = await getDeal(id);
  if (!deal) notFound();
  const [facts, links, parties, people] = await Promise.all([dealFacts(id), dealLinks(id), listParties(), listAssignees()]);
  const steps = dealSteps(facts!);
  const path = pathOf(deal.pillar);
  const banner = notice ? RECORD_NOTICES[notice] : undefined;
  const today = todayIST();
  const sql = await getSql();
  const target = path === "holding" && facts?.holdingId
    ? (await sql.query<{ name: string }>("select name from holdings where id = $1", [facts.holdingId]))[0]
    : path === "venture" && facts?.ventureId
      ? (await sql.query<{ name: string }>("select name from ventures where id = $1", [facts.ventureId]))[0]
      : null;
  const canKyc = can(user.role, "kyc");
  const canVault = can(user.role, "vault");
  const back = `deal:${deal.id}`;
  const outstanding = links.invoices.filter((i) => i.status === "issued").reduce((s, i) => s + decimalToPaise(i.outstanding), 0n);

  return (
    <div className="space-y-6" data-deal-record={deal.name}>
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-white">{deal.name}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {pillarLabel(deal.pillar)}{deal.value ? ` · ${inr(deal.value)}` : ""} ·{" "}
              {deal.party_id ? <Link href={`/portal/parties/${deal.party_id}`} className="text-blue-400 hover:text-blue-300">{deal.party_name}</Link> : "No contact yet"}
            </p>
          </div>
          <form action={moveDeal} className="flex items-center gap-2">
            <input type="hidden" name="dealId" value={deal.id} />
            <span className="text-sm text-slate-400">Stage</span>
            <StatusChip status={deal.stage} label={stageLabel(deal.stage)} tone={deal.stage === "closed" ? "success" : deal.stage === "passed" ? "neutral" : "info"} />
            <select name="stage" defaultValue={deal.stage} aria-label={`Stage for ${deal.name}`} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white">
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <SubmitButton pending="Moving…" className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">Move</SubmitButton>
          </form>
        </div>
        {deal.pending_stage ? <p className="mt-2 text-xs text-amber-400">Waiting for approval to move to {stageLabel(deal.pending_stage)}.</p> : null}
      </div>

      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}

      <WorkflowSteps steps={steps} title={PATH_LABEL[path]} note={path === "cash" ? "Boring Stack fees are invoiced" : path === "holding" ? "the stake goes into Portfolio" : "the venture runs in Ventures"} />

      {/* The two actions the steps point at that are done on this page. */}
      {facts?.partyId && facts.kyc === "none" && canKyc ? (
        <form id="start-kyc" action={startPartyKyc} className="scroll-mt-28">
          <input type="hidden" name="back" value={back} />
          <SubmitButton pending="Opening…" className={btn}>Start KYC for {deal.party_name}</SubmitButton>
        </form>
      ) : null}
      {!deal.party_id ? (
        <section id="contact" className={`${card} scroll-mt-28 p-5`}>
          <h3 className={h3}><Contact aria-hidden className="h-4 w-4 text-slate-500" />Link a contact</h3>
          <p className="mt-1 text-sm text-slate-400">KYC, invoices and messages all hang off the contact.</p>
          {parties.length ? (
            <form action={linkDealParty} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="back" value={back} />
              <select name="partyId" required className={`${input} max-w-xs`} aria-label="Contact">
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <SubmitButton pending="Linking…" className={btn}>Link</SubmitButton>
            </form>
          ) : <p className="mt-3 text-sm text-slate-400"><Link href="/portal/parties#add" className="text-blue-400">Add a contact</Link> first.</p>}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {path === "cash" || links.invoices.length ? (
          <section id="invoices" className={`${card} scroll-mt-28 p-5`} data-links="invoices">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className={h3}><Receipt aria-hidden className="h-4 w-4 text-slate-500" />Invoices</h3>
              <Link href={`/portal/invoices?view=new&deal=${deal.id}`} className="text-xs font-medium text-blue-400 hover:text-blue-300">Raise an invoice</Link>
            </div>
            {links.invoices.length === 0 ? <p className="text-sm text-slate-500">None yet. An invoice raised from here is tied to this deal.</p> : (
              <ul className="divide-y divide-slate-800 text-sm">
                {links.invoices.map((i) => {
                  const due = i.status === "issued" && decimalToPaise(i.outstanding) > 0n ? dueState(i.due_date, today) : null;
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/portal/invoices?inv=${i.id}`} className="text-slate-200 hover:text-white">{i.number ?? "Draft"}</Link>
                      <span className="flex items-center gap-2 text-xs text-slate-400">
                        {rupees(decimalToPaise(i.total))}<StatusChip status={i.status} />{due ? <DueChip state={due} /> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {outstanding > 0n ? <p className="mt-2 text-xs text-slate-400">{rupees(outstanding)} still owed.</p> : null}
          </section>
        ) : null}

        {path !== "cash" ? (
          <section className={`${card} p-5`} data-links={path}>
            <h3 className={h3}>{path === "holding" ? "Holding" : "Venture"}</h3>
            {target ? (
              <p className="mt-2 text-sm"><Link href={path === "holding" ? `/portal/portfolio?h=${facts!.holdingId}` : `/portal/ventures?v=${facts!.ventureId}`} className="text-blue-400 hover:text-blue-300">{target.name}</Link></p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Not set up yet.{" "}
                <Link href={path === "holding" ? `/portal/portfolio?deal=${deal.id}#add-holding` : `/portal/ventures?deal=${deal.id}#add-venture`} className="text-blue-400 hover:text-blue-300">
                  {path === "holding" ? "Record the holding" : "Set up the venture"}
                </Link>
              </p>
            )}
          </section>
        ) : null}

        <section className={`${card} p-5`} data-links="money">
          <h3 className={`${h3} mb-3`}><Wallet aria-hidden className="h-4 w-4 text-slate-500" />Money</h3>
          {links.money.length === 0 ? <p className="text-sm text-slate-500">No money recorded against this deal.</p> : (
            <ul className="divide-y divide-slate-800 text-sm">
              {links.money.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-slate-300">{m.entry_date} · {m.memo || (m.direction === "in" ? "Money in" : "Payment")}</span>
                  <span className="flex items-center gap-2 text-xs"><span className="tabular-nums text-slate-200">{m.direction === "out" ? "−" : ""}{rupees(decimalToPaise(m.amount))}</span><StatusChip status={m.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="tasks" className={`${card} scroll-mt-28 p-5`} data-links="tasks">
          <h3 className={`${h3} mb-3`}><ListChecks aria-hidden className="h-4 w-4 text-slate-500" />Tasks</h3>
          {links.tasks.length === 0 ? <p className="mb-3 text-sm text-slate-500">No tasks yet.</p> : (
            <ul className="mb-3 divide-y divide-slate-800 text-sm">
              {links.tasks.map((t) => {
                const due = !t.done && t.due_date ? dueState(t.due_date, today) : null;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2" data-record-task={t.title}>
                    <span className={t.done ? "text-slate-500 line-through" : "text-slate-200"}>{t.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">{t.assignee_email?.split("@")[0] ?? "Nobody"}{due ? <DueChip state={due} /> : null}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <form action={addRecordTask} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="back" value={back} />
            <input name="title" required minLength={2} maxLength={200} placeholder="Add a task for this deal" className={`${input} sm:col-span-3`} />
            <input name="due" type="date" className={input} aria-label="Due date" />
            <select name="assigneeId" defaultValue={user.id} className={input} aria-label="Owner">
              <option value="">Nobody yet</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <SubmitButton pending="Adding…" className={btn}>Add</SubmitButton>
          </form>
        </section>

        {canVault ? (
          <section id="documents" className={`${card} scroll-mt-28 p-5`} data-links="documents">
            <h3 className={`${h3} mb-3`}><FileText aria-hidden className="h-4 w-4 text-slate-500" />Documents</h3>
            {links.documents.length === 0 ? <p className="mb-3 text-sm text-slate-500">Term sheets, agreements and diligence notes kept with the deal.</p> : (
              <ul className="mb-3 divide-y divide-slate-800 text-sm">
                {links.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <a href={`/portal/vault/file/${d.id}`} className="truncate text-slate-200 hover:text-white">{d.title}</a>
                    <span className="shrink-0 text-xs text-slate-500">{d.created_at}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={attachRecordDoc} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input type="hidden" name="back" value={back} />
              <input name="file" type="file" required className="text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:text-slate-200" aria-label="File" />
              <select name="category" defaultValue="legal" className={input} aria-label="Category">{DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              <SubmitButton pending="Attaching…" className={btn}>Attach</SubmitButton>
            </form>
          </section>
        ) : null}
      </div>

      {links.tasks.length === 0 && links.money.length === 0 && links.invoices.length === 0 && deal.stage !== "closed" ? (
        <EmptyState compact icon={ListChecks} title="Nothing linked yet" body="Once the deal closes, its next step opens here as a task, and KYC starts for its contact." />
      ) : null}
    </div>
  );
}
