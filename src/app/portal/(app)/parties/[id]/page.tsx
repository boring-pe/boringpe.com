import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, FileText, Handshake, ListChecks, MessageCircle, Receipt, Wallet } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { decimalToPaise } from "@/lib/books";
import { rupees } from "@/lib/accounting";
import { RECORD_NOTICES } from "@/lib/notices";
import { listAssignees } from "@/lib/ops";
import { inr, pillarLabel, stageLabel } from "@/lib/ops-fields";
import { can } from "@/lib/rbac";
import { DOC_CATEGORIES } from "@/lib/vault-fields";
import { dealStepsFor, partyRecord, unlinkedChats } from "@/lib/workflows";
import { todayIST } from "@/lib/dashboard-calc";
import { addRecordTask, attachRecordDoc, linkPartyChat, startPartyKyc } from "../../deals/record-actions";
import { StepDots } from "../../_shell/workflow";
import { DueChip, StatusChip, dueState } from "../../_shell/status";
import { SubmitButton } from "../../_shell/buttons";

const card = "rounded-xl border border-slate-800 bg-slate-900 p-5";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700";
const h3 = "flex items-center gap-2 text-sm font-semibold text-white";
const none = "text-sm text-slate-500";

/** One contact, and everything done with them: one page instead of nine. */
export default async function PartyRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const user = await requireSection("parties");
  const { id } = await params;
  const { notice } = await searchParams;
  const rec = await partyRecord(id);
  if (!rec) notFound();
  const { party, deals, invoices, money, kyc, tasks, documents, wa } = rec;
  const seeChats = can(user.role, "whatsapp");
  const [flows, people, chats] = await Promise.all([
    dealStepsFor(deals.map((d) => d.id)),
    listAssignees(),
    seeChats && wa.length === 0 ? unlinkedChats() : Promise.resolve([]),
  ]);
  const banner = notice ? RECORD_NOTICES[notice] : undefined;
  const today = todayIST();
  const back = `party:${party.id}`;
  const owed = invoices.filter((i) => i.status === "issued").reduce((s, i) => s + decimalToPaise(i.outstanding), 0n);
  const overdue = invoices.filter((i) => i.status === "issued" && decimalToPaise(i.outstanding) > 0n && dueState(i.due_date, today) === "overdue").length;
  const latestKyc = kyc[0];

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Deals", value: `${deals.length}${deals.filter((d) => d.stage !== "closed" && d.stage !== "passed").length ? `, ${deals.filter((d) => d.stage !== "closed" && d.stage !== "passed").length} open` : ""}` },
    { label: "Owed to us", value: <>{rupees(owed)}{overdue ? <span className="ml-2 align-middle"><DueChip state="overdue" label={`${overdue} overdue`} /></span> : null}</> },
    { label: "KYC", value: latestKyc ? <StatusChip status={latestKyc.status} /> : "Not started" },
    { label: "Open tasks", value: tasks.filter((t) => !t.done).length },
  ];

  return (
    <div className="space-y-6" data-party-record={party.name}>
      <div>
        <h2 className="text-white">{party.name}</h2>
        <p className="mt-1 text-sm capitalize text-slate-400">{party.kind}{party.email ? <span className="normal-case"> · <a href={`mailto:${party.email}`} className="text-blue-400 hover:text-blue-300">{party.email}</a></span> : null}{party.gstin ? <span className="normal-case"> · GSTIN {party.gstin}</span> : null}</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}

      <dl className="flex flex-wrap rounded-xl border border-slate-800 bg-slate-900 p-1" data-party-facts>
        {facts.map((f, i) => (
          <div key={f.label} className={`flex min-w-[9rem] flex-1 flex-col gap-0.5 px-3 py-2 ${i ? "sm:border-l sm:border-slate-800" : ""}`}>
            <dt className="text-xs text-slate-500">{f.label}</dt>
            <dd className="text-base font-semibold tabular-nums text-white">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} data-links="deals">
          <div className="mb-3 flex items-center justify-between"><h3 className={h3}><Handshake aria-hidden className="h-4 w-4 text-slate-500" />Deals</h3><Link href="/portal/deals#add" className="text-xs text-blue-400 hover:text-blue-300">Add a deal</Link></div>
          {deals.length === 0 ? <p className={none}>No deals with {party.name} yet.</p> : (
            <ul className="divide-y divide-slate-800 text-sm">
              {deals.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/portal/deals/${d.id}`} className="text-slate-200 hover:text-white">{d.name}</Link>
                    <span className="text-xs text-slate-500">{pillarLabel(d.pillar)} · {stageLabel(d.stage)}{d.value ? ` · ${inr(d.value)}` : ""}</span>
                  </div>
                  {flows.get(d.id) && (d.stage === "closing" || d.stage === "closed") ? <div className="mt-1"><StepDots steps={flows.get(d.id)!} /></div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card} data-links="kyc">
          <h3 className={`${h3} mb-3`}><BadgeCheck aria-hidden className="h-4 w-4 text-slate-500" />KYC</h3>
          {kyc.length === 0 ? (
            can(user.role, "kyc") ? (
              <form action={startPartyKyc} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="back" value={back} />
                <p className={none}>No KYC case yet.</p>
                <SubmitButton pending="Opening…" className={btn}>Start KYC</SubmitButton>
              </form>
            ) : <p className={none}>No KYC case yet.</p>
          ) : (
            <ul className="divide-y divide-slate-800 text-sm">
              {kyc.map((k) => <li key={k.id} className="flex items-center justify-between py-2"><Link href={`/portal/kyc?c=${k.id}`} className="text-slate-200 hover:text-white">{k.subject_name}</Link><StatusChip status={k.status} /></li>)}
            </ul>
          )}
        </section>

        <section className={card} data-links="invoices">
          <h3 className={`${h3} mb-3`}><Receipt aria-hidden className="h-4 w-4 text-slate-500" />Invoices</h3>
          {invoices.length === 0 ? <p className={none}>No invoices to {party.name}.</p> : (
            <ul className="divide-y divide-slate-800 text-sm">
              {invoices.map((i) => {
                const due = i.status === "issued" && decimalToPaise(i.outstanding) > 0n ? dueState(i.due_date, today) : null;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/portal/invoices?inv=${i.id}`} className="text-slate-200 hover:text-white">{i.number ?? "Draft"}</Link>
                    <span className="flex items-center gap-2 text-xs text-slate-400">{rupees(decimalToPaise(i.total))}<StatusChip status={i.status} />{due ? <DueChip state={due} /> : null}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={card} data-links="money">
          <h3 className={`${h3} mb-3`}><Wallet aria-hidden className="h-4 w-4 text-slate-500" />Money</h3>
          {money.length === 0 ? <p className={none}>No money recorded with {party.name}.</p> : (
            <ul className="divide-y divide-slate-800 text-sm">
              {money.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-slate-300">{m.entry_date} · {m.memo || (m.direction === "in" ? "Money in" : "Payment")}</span>
                  <span className="flex items-center gap-2 text-xs"><span className="tabular-nums text-slate-200">{m.direction === "out" ? "−" : ""}{rupees(decimalToPaise(m.amount))}</span><StatusChip status={m.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="tasks" className={`${card} scroll-mt-28`} data-links="tasks">
          <h3 className={`${h3} mb-3`}><ListChecks aria-hidden className="h-4 w-4 text-slate-500" />Tasks</h3>
          {tasks.length === 0 ? <p className={`${none} mb-3`}>No tasks for {party.name}.</p> : (
            <ul className="mb-3 divide-y divide-slate-800 text-sm">
              {tasks.map((t) => {
                const due = !t.done && t.due_date ? dueState(t.due_date, today) : null;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2" data-record-task={t.title}>
                    <span className={t.done ? "text-slate-500 line-through" : "text-slate-200"}>{t.title}{t.deal_name ? <span className="text-xs text-slate-500"> · {t.deal_name}</span> : null}</span>
                    {due ? <DueChip state={due} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <form action={addRecordTask} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="back" value={back} />
            <input name="title" required minLength={2} maxLength={200} placeholder={`Add a task about ${party.name}`} className={`${input} sm:col-span-3`} />
            <input name="due" type="date" className={input} aria-label="Due date" />
            <select name="assigneeId" defaultValue={user.id} className={input} aria-label="Owner">
              <option value="">Nobody yet</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <SubmitButton pending="Adding…" className={btn}>Add</SubmitButton>
          </form>
        </section>

        {can(user.role, "vault") ? (
          <section id="documents" className={`${card} scroll-mt-28`} data-links="documents">
            <h3 className={`${h3} mb-3`}><FileText aria-hidden className="h-4 w-4 text-slate-500" />Documents</h3>
            {documents.length === 0 ? <p className={`${none} mb-3`}>Agreements, KYC papers and correspondence with {party.name}.</p> : (
              <ul className="mb-3 divide-y divide-slate-800 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <a href={`/portal/vault/file/${d.id}`} className="truncate text-slate-200 hover:text-white">{d.title}</a>
                    <span className="shrink-0 text-xs text-slate-500">{d.deal_name ? `${d.deal_name} · ` : ""}{d.created_at}</span>
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

        {seeChats ? (
          <section id="whatsapp" className={`${card} scroll-mt-28`} data-links="whatsapp">
            <h3 className={`${h3} mb-3`}><MessageCircle aria-hidden className="h-4 w-4 text-slate-500" />WhatsApp</h3>
            {wa.length ? (
              <ul className="divide-y divide-slate-800 text-sm">
                {wa.map((c) => (
                  <li key={c.wa_id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/portal/whatsapp?c=${c.wa_id}`} className="text-slate-200 hover:text-white">{c.name ?? `+${c.wa_id}`}</Link>
                      <span className="text-xs text-slate-500">{c.last_message_at}{c.unread ? ` · ${c.unread} unread` : ""}</span>
                    </div>
                    {c.last_text ? <p className="mt-0.5 truncate text-xs text-slate-400">{c.last_text}</p> : null}
                  </li>
                ))}
              </ul>
            ) : chats.length ? (
              <form action={linkPartyChat} className="flex flex-wrap gap-2">
                <input type="hidden" name="back" value={back} />
                <select name="waId" className={`${input} max-w-xs`} aria-label="WhatsApp chat">{chats.map((c) => <option key={c.wa_id} value={c.wa_id}>{c.name ?? `+${c.wa_id}`}</option>)}</select>
                <SubmitButton pending="Linking…" className={btn}>Link chat</SubmitButton>
              </form>
            ) : <p className={none}>No WhatsApp chats yet. Chats appear in WhatsApp when this contact messages us.</p>}
          </section>
        ) : null}
      </div>
    </div>
  );
}
