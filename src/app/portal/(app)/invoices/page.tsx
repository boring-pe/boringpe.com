import Link from "next/link";
import { FilterBar } from "../_shell/filter-bar";
import { getDeal } from "@/lib/ops";
import { VerticalSelect } from "../_shell/vertical-select";
import { VerticalFilter } from "../_shell/vertical-filter";
import { isVertical, verticalLabel } from "@/lib/ops-fields";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { decimalToPaise } from "@/lib/books";
import { fiscalYearOf } from "@/lib/hr-calc";
import { AGEING, GST_RATES, STATES, stateName } from "@/lib/invoice-calc";
import {
  INCOME_ACCOUNTS, getInvoice, gstProfiles, gstSummary, listInvoices, listPartiesGst, receivables,
} from "@/lib/invoices";
import { CURRENCIES } from "@/lib/assets-calc";
import { canPostBooks } from "@/lib/rbac";
import { monthEnd } from "@/lib/venture-calc";
import { invoiceAction, newInvoice, paymentLink, saveEntityGst, savePartyGst } from "./actions";
import { linksFor, razorpayReady } from "@/lib/payments";
import { PrintButton } from "./print-button";
import { ConfirmButton, SubmitButton } from "../_shell/buttons";
import { Receipt } from "lucide-react";
import { DueChip, EmptyState, StatusChip, dueState } from "../_shell/status";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  drafted: { text: "Draft saved. Check it, then issue it." },
  deleted: { text: "Draft deleted." },
  saved: { text: "Saved." },
  "done-issue": { text: "Invoice issued and posted to the books." },
  "done-receipt": { text: "Receipt recorded and posted to the books." },
  "done-cancel": { text: "Invoice cancelled; its posting was reversed." },
  paylink: { text: "Payment link ready. Share it with the customer; it posts here when paid." },
  "paylink-failed": { text: "Razorpay did not create the link. The Integrations activity log has the reason.", bad: true },
  "done-settle": { text: "Settled between our entities in both sets of books." },
  invalid: { text: "That was not valid.", bad: true },
  lines: { text: "Each line needs a description, a quantity, a rate and a GST rate.", bad: true },
  gstin: { text: "That GSTIN or state is not valid. A GSTIN has 15 characters and a check character that must match.", bad: true },
  "too-much": { text: "That is more than is still outstanding on this invoice.", bad: true },
  "needs-fx": { text: "Say how much of the invoice's currency this payment settles.", bad: true },
  rate: { text: "Give the exchange rate in rupees per unit, for example 83.45.", bad: true },
  "not-open": { text: "This invoice is not open for receipts.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
  "books-refused": { text: "The books refused that posting.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";
const r = (d: string) => rupees(decimalToPaise(d));
const VIEWS = [["list", "Invoices"], ["new", "New invoice"], ["receivables", "Receivables"], ["gst", "GST summary"], ["settings", "GST settings"]] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; inv?: string; notice?: string; e?: string; month?: string; vertical?: string; deal?: string }>;
}) {
  const user = await requireSection("invoices");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const post = canPostBooks(user.role);
  const views = VIEWS.filter(([id]) => post || (id !== "new" && id !== "settings"));
  const view = views.some(([id]) => id === sp.view) ? sp.view! : "list";

  return (
    <div className="space-y-8">
      <div className="print:hidden">
        <h2 className="text-2xl font-bold text-white">Invoices</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">GST invoices from any of our entities, receipts with TDS, what is owed to us, and the monthly GST position.</p>
      </div>
      {banner ? (
        <p role="status" className={`print:hidden rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}
      <nav aria-label="Invoice sections" className="print:hidden flex flex-wrap gap-1 border-b border-slate-800">
        {views.map(([id, label]) => (
          <Link key={id} href={`/portal/invoices?view=${id}`} className={`px-4 py-2 text-sm -mb-px border-b-2 ${view === id && !sp.inv ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>{label}</Link>
        ))}
      </nav>
      {sp.inv ? <Detail id={sp.inv} post={post} owner={user.role === "super_admin"} />
        : view === "new" ? <NewInvoice dealId={sp.deal} />
        : view === "receivables" ? <Receivables />
        : view === "gst" ? <Gst entity={sp.e} month={sp.month} />
        : view === "settings" ? <Settings />
        : <List vertical={isVertical(sp.vertical) ? sp.vertical : null} />}
    </div>
  );
}

async function List({ vertical }: { vertical: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (await listInvoices()).filter((i) => !vertical || i.vertical === vertical);
  return (
    <div className="space-y-3">
    <VerticalFilter base="/portal/invoices" current={vertical} />
    <section className={`${card} overflow-x-auto`}>
      {rows.length ? <FilterBar list="invoices" placeholder="Search number, party, entity" noun={["invoice", "invoices"]} chips={[{ id: "draft", label: "Draft" }, { id: "issued", label: "Issued" }, { id: "overdue", label: "Overdue" }, { id: "paid", label: "Paid" }, { id: "cancelled", label: "Cancelled" }]} /> : null}
      <table className="w-full">
        <thead><tr><th className={th}>Number</th><th className={th}>Date</th><th className={th}>From</th><th className={th}>To</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Outstanding</th><th className={th}>Vertical</th><th className={th}>Status</th></tr></thead>
        <tbody data-filter-list="invoices">
          {rows.length === 0 ? <tr><td colSpan={8} className="p-6"><EmptyState compact icon={Receipt} title="No invoices yet" body="Raise a GST invoice to a party; it posts to the books when you issue it." action={{ label: "New invoice", href: "/portal/invoices?view=new" }} /></td></tr> : rows.map((i) => {
            const out = decimalToPaise(i.total) - decimalToPaise(i.received) - decimalToPaise(i.tds);
            return (
              <tr key={i.id} className="border-t border-slate-800" data-invoice={i.number ?? `draft ${i.party_name}`} data-row data-tags={`${i.status}${i.status === "issued" && out > 0n && dueState(i.due_date, today) === "overdue" ? " overdue" : ""}`}>
                <td className={td}><Link href={`/portal/invoices?inv=${i.id}`} className="text-blue-300 hover:text-blue-200">{i.number ?? "Draft"}</Link></td>
                <td className={td}>{i.issue_date}</td><td className={td}>{i.entity_name}</td><td className={td}>{i.party_name}</td>
                <td className={num}>{r(i.total)}</td><td className={num}>{i.status === "issued" ? rupees(out) : ""}</td>
                <td className={td}>{verticalLabel(i.vertical)}</td>
                <td className={td}><span className="inline-flex flex-wrap gap-1"><StatusChip status={i.status} />{i.status === "issued" && out > 0n && dueState(i.due_date, today) ? <DueChip state={dueState(i.due_date, today)!} /> : null}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
    </div>
  );
}

async function NewInvoice({ dealId }: { dealId?: string }) {
  const [profiles, parties, deal] = await Promise.all([gstProfiles(), listPartiesGst(), dealId ? getDeal(dealId) : Promise.resolve(null)]);
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.parse(`${today}T00:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10);
  const home = profiles[0]?.state_code ?? "27";
  return (
    <section className={`${card} p-6`}>
      {parties.length === 0 ? <p className="mb-4 text-sm text-amber-300">Add the customer as a party first (Deal Pipeline → parties), then its GSTIN under GST settings.</p> : null}
      {deal ? (
        <p className="mb-4 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200" data-invoice-deal>
          For the deal <Link href={`/portal/deals/${deal.id}`} className="font-medium underline">{deal.name}</Link>. The invoice is tied to it and shows on its page.
        </p>
      ) : null}
      <form action={newInvoice} className="space-y-4">
        {deal ? <input type="hidden" name="dealId" value={deal.id} /> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <select name="entityId" defaultValue={profiles[0]?.id} className={input} aria-label="From">
            {profiles.map((e) => <option key={e.id} value={e.id}>From {e.name}{e.gstin ? ` (${e.gstin})` : " (no GSTIN)"}</option>)}
          </select>
          <select name="partyId" defaultValue={deal?.party_id ?? undefined} className={input} aria-label="Bill to">
            {parties.map((p) => <option key={p.id} value={p.id}>To {p.name}{p.gstin ? ` (${p.gstin})` : ""}</option>)}
          </select>
          <select name="placeOfSupply" defaultValue={home} className={input} aria-label="Place of supply">
            {STATES.map((s) => <option key={s.code} value={s.code}>Place of supply: {s.code} {s.name}</option>)}
          </select>
          <label className="text-xs text-slate-500">Invoice date<input name="issueDate" type="date" defaultValue={today} className={`${input} mt-1`} /></label>
          <label className="text-xs text-slate-500">Due date<input name="dueDate" type="date" defaultValue={due} className={`${input} mt-1`} /></label>
          <VerticalSelect className={input} />
          <select name="incomeCode" defaultValue="4010" className={input} aria-label="Income account">
            {INCOME_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>Income: {a.label}</option>)}
          </select>
          <select name="currency" defaultValue="INR" className={input} aria-label="Currency">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c === "INR" ? "Invoice in rupees" : `Invoice in ${c}`}</option>)}
          </select>
          <input name="fxRate" inputMode="decimal" placeholder="Rate: ₹ per unit (if not INR)" className={input} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid gap-3 md:grid-cols-[3fr_1fr_1fr_1.5fr_1fr]">
            <input name={`desc${i}`} maxLength={200} placeholder={`Line ${i + 1}: description`} className={input} />
            <input name={`sac${i}`} maxLength={10} placeholder="SAC / HSN" className={input} />
            <input name={`qty${i}`} inputMode="decimal" placeholder="Qty (1)" className={input} />
            <input name={`rate${i}`} inputMode="decimal" placeholder="Rate ₹" className={input} />
            <select name={`gst${i}`} defaultValue="1800" className={input} aria-label={`GST ${i + 1}`}>
              {GST_RATES.map((g) => <option key={g} value={g}>GST {g / 100}%</option>)}
            </select>
          </div>
        ))}
        <input name="notes" maxLength={500} placeholder="Notes for the customer (bank details, terms)" className={input} />
        <SubmitButton className={btn}>Save draft</SubmitButton>
      </form>
    </section>
  );
}

async function Detail({ id, post, owner }: { id: string; post: boolean; owner: boolean }) {
  const inv = await getInvoice(id);
  if (!inv) return <p className="text-sm text-slate-500">That invoice was not found.</p>;
  const outstanding = decimalToPaise(inv.total) - decimalToPaise(inv.received) - decimalToPaise(inv.tds);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <article className="paper rounded-xl border border-slate-800 bg-white p-8 text-slate-900 print:border-0 print:p-0" data-invoice-doc>
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="text-xl font-bold">{inv.seller.name}</div>
            {inv.seller.address ? <div className="text-sm">{inv.seller.address}</div> : null}
            <div className="text-sm">{inv.seller.gstin ? `GSTIN ${inv.seller.gstin}` : "GSTIN not registered"}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">{inv.seller.gstin ? "Tax invoice" : "Invoice"}</div>
            <div className="text-sm">{inv.number ?? "DRAFT"}</div>
            <div className="text-sm">Date {inv.issue_date} · Due {inv.due_date}</div>
            <div className={`text-sm font-semibold capitalize ${inv.status === "paid" ? "text-green-700" : inv.status === "cancelled" ? "text-red-700" : ""}`}>{inv.status}</div>
          </div>
        </div>
        <div className="mt-6 text-sm">
          <div className="text-xs uppercase text-slate-500">Bill to</div>
          <div className="font-semibold">{inv.buyer.name}</div>
          {inv.buyer.address ? <div>{inv.buyer.address}</div> : null}
          {inv.buyer.gstin ? <div>GSTIN {inv.buyer.gstin}</div> : null}
          <div>Place of supply: {inv.place_of_supply} {stateName(inv.place_of_supply)}</div>
        </div>
        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500"><th className="py-2">Description</th><th>SAC</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="py-2">{l.description}</td><td>{l.sac}</td><td className="text-right">{Number(l.qty_milli) / 1000}</td>
                <td className="text-right">{l.fx_rate_amount ? `${inv.currency} ${l.fx_rate_amount}` : r(l.rate)}</td><td className="text-right">{l.gst_bps / 100}%</td>
                <td className="text-right">{l.fx_amount ? <>{inv.currency} {l.fx_amount}<div className="text-xs text-slate-500">{r(l.amount)}</div></> : r(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Taxable value</span><span>{r(inv.subtotal)}</span></div>
          {decimalToPaise(inv.cgst) ? <div className="flex justify-between"><span>CGST</span><span>{r(inv.cgst)}</span></div> : null}
          {decimalToPaise(inv.sgst) ? <div className="flex justify-between"><span>SGST</span><span>{r(inv.sgst)}</span></div> : null}
          {decimalToPaise(inv.igst) ? <div className="flex justify-between"><span>IGST</span><span>{r(inv.igst)}</span></div> : null}
          {inv.currency !== "INR" && inv.fx_total ? <div className="flex justify-between border-t border-slate-300 pt-1 text-base font-bold" data-fx-total><span>Total</span><span>{inv.currency} {inv.fx_total}</span></div> : null}
          <div className={`flex justify-between ${inv.currency !== "INR" ? "text-slate-600" : "border-t border-slate-300 pt-1 text-base font-bold"}`} data-total><span>{inv.currency !== "INR" ? `In rupees at ${inv.fx_rate}` : "Total"}</span><span>{r(inv.total)}</span></div>
          {inv.status !== "draft" ? <div className="flex justify-between" data-outstanding><span>Outstanding</span><span>{rupees(inv.status === "issued" ? outstanding : 0n)}</span></div> : null}
        </div>
        {inv.notes ? <p className="mt-6 text-sm text-slate-600">{inv.notes}</p> : null}
      </article>

      <div className="print:hidden flex flex-wrap gap-3">
        <PrintButton />
        {post && inv.status === "draft" ? (
          <form action={invoiceAction} className="flex gap-3">
            <input type="hidden" name="id" value={inv.id} />
            <SubmitButton name="what" value="issue" pending="Issuing…" className={btn}>Issue invoice</SubmitButton>
            <ConfirmButton name="what" value="delete" title="Delete this draft invoice?" body="The draft and its lines are removed for good. Nothing was issued, so the books are not affected." confirm="Delete draft">Delete draft</ConfirmButton>
          </form>
        ) : null}
        {owner && inv.status === "issued" && inv.buyer.entity_id && outstanding > 0n ? (
          <form action={invoiceAction}>
            <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="date" value={today} />
            <button name="what" value="settle" className={btn}>Settle between our entities</button>
          </form>
        ) : null}
        {owner && inv.status === "issued" && inv.source_type === "manual" && decimalToPaise(inv.received) + decimalToPaise(inv.tds) === 0n ? (
          <form action={invoiceAction}>
            <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="date" value={today} />
            <ConfirmButton name="what" value="cancel" title={`Cancel invoice ${inv.number ?? ""}?`} body="The invoice is marked cancelled and its entry in the books is reversed. The number is kept and cannot be reused. This cannot be undone." confirm="Cancel invoice" className="rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:text-red-200">Cancel invoice</ConfirmButton>
          </form>
        ) : null}
      </div>

      {post && inv.status === "issued" && inv.currency === "INR" && outstanding >= 100n ? (
        <PayLinks invoiceId={inv.id} />
      ) : null}

      {inv.receipts.length ? (
        <section className={`${card} print:hidden overflow-x-auto`}>
          <table className="w-full">
            <thead><tr><th className={th}>Received on</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>TDS deducted</th></tr></thead>
            <tbody>{inv.receipts.map((x, i) => <tr key={i} className="border-t border-slate-800"><td className={td}>{x.receipt_date}</td><td className={num}>{r(x.amount)}</td><td className={num}>{r(x.tds)}</td></tr>)}</tbody>
          </table>
        </section>
      ) : null}

      {post && inv.status === "issued" ? (
        <section className={`${card} print:hidden p-6`}>
          <h3 className="text-sm font-semibold text-white mb-1">Record a receipt</h3>
          <p className="text-xs text-slate-500 mb-4">If the customer deducted TDS, enter it separately: it becomes TDS receivable, claimable against tax.</p>
          <form action={invoiceAction} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="id" value={inv.id} />
            <input name="date" type="date" defaultValue={today} className={input} aria-label="Date" />
            <input name="amount" inputMode="decimal" placeholder="Rupees received ₹" className={input} />
            {inv.currency !== "INR" ? <input name="fxSettled" inputMode="decimal" placeholder={`${inv.currency} settled (of ${inv.fx_total})`} className={input} /> : null}
            <input name="tds" inputMode="decimal" placeholder="TDS deducted ₹" className={input} />
            <button name="what" value="receipt" className={btn}>Record receipt</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function Receivables() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await receivables(today);
  const totals = AGEING.map((_, i) => rows.reduce((s, x) => s + x.buckets[i], 0n));
  return (
    <section className={`${card} overflow-x-auto`}>
      <table className="w-full">
        <thead><tr><th className={th}>Customer</th><th className={th}>Owed to</th>{AGEING.map((a) => <th key={a} className={`${th} text-right`}>{a}</th>)}<th className={`${th} text-right`}>Total</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-sm text-slate-500">Nothing outstanding.</td></tr> : rows.map((x) => (
            <tr key={`${x.entity}${x.party}`} className="border-t border-slate-800" data-receivable={x.party}>
              <td className={td}>{x.party}</td><td className={td}>{x.entity}</td>
              {x.buckets.map((b, i) => <td key={i} className={num}>{b ? rupees(b) : ""}</td>)}<td className={`${num} font-semibold`}>{rupees(x.total)}</td>
            </tr>
          ))}
          {rows.length ? (
            <tr className="border-t border-slate-700 font-semibold"><td className={td} colSpan={2}>Total</td>{totals.map((b, i) => <td key={i} className={num}>{rupees(b)}</td>)}<td className={num}>{rupees(totals.reduce((a, b) => a + b, 0n))}</td></tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

async function Gst({ entity, month }: { entity?: string; month?: string }) {
  const profiles = await gstProfiles();
  const e = profiles.find((x) => x.id === entity) ?? profiles[0];
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const from = `${m}-01`;
  const s = await gstSummary(e.id, from, monthEnd(from));
  return (
    <div className="space-y-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value="gst" />
        <select name="e" defaultValue={e.id} className={`${input} w-auto`} aria-label="Entity">{profiles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input name="month" type="month" defaultValue={m} className={`${input} w-auto`} aria-label="Month" />
        <button className={btn}>Show</button>
      </form>
      <p className="text-sm text-slate-400">{e.name} · {e.gstin ? `GSTIN ${e.gstin}` : "No GSTIN set"} · {m}. A working summary for GSTR-1 and GSTR-3B; your CA files the returns.</p>
      <div className="grid gap-4 md:grid-cols-4" data-gst>
        {[["Output CGST", s.cgst], ["Output SGST", s.sgst], ["Output IGST", s.igst], ["Input credit", s.inputCredit], ["B2B taxable value", s.b2bValue], ["B2C taxable value", s.b2cValue], ["Output tax", s.output], ["Net GST payable", s.netPayable]].map(([label, v]) => (
          <div key={label as string} className={`${card} p-4`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label as string}</div>
            <div className="mt-1 text-lg font-semibold text-white">{rupees(v as bigint)}</div>
          </div>
        ))}
      </div>
      <section className={`${card} overflow-x-auto`}>
        <h3 className="px-3 pt-3 text-sm font-semibold text-white">By rate</h3>
        <table className="w-full">
          <thead><tr><th className={th}>Rate</th><th className={`${th} text-right`}>Taxable value</th><th className={`${th} text-right`}>Tax</th></tr></thead>
          <tbody>{s.byRate.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-sm text-slate-500">No invoices this month.</td></tr> : s.byRate.map((x) => (
            <tr key={x.rate} className="border-t border-slate-800" data-rate={x.rate}><td className={td}>{x.rate / 100}%</td><td className={num}>{rupees(x.taxable)}</td><td className={num}>{rupees(x.tax)}</td></tr>
          ))}</tbody>
        </table>
      </section>
      {s.b2b.length ? (
        <section className={`${card} overflow-x-auto`}>
          <h3 className="px-3 pt-3 text-sm font-semibold text-white">B2B invoices (GSTR-1)</h3>
          <table className="w-full">
            <thead><tr><th className={th}>Number</th><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>GSTIN</th><th className={th}>Place</th><th className={`${th} text-right`}>Taxable</th><th className={`${th} text-right`}>Tax</th></tr></thead>
            <tbody>{s.b2b.map((x) => (
              <tr key={x.number} className="border-t border-slate-800"><td className={td}>{x.number}</td><td className={td}>{x.issue_date}</td><td className={td}>{x.party}</td><td className={td}>{x.gstin}</td><td className={td}>{x.place}</td><td className={num}>{r(x.taxable)}</td><td className={num}>{r(x.tax)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

async function Settings() {
  const [profiles, parties] = await Promise.all([gstProfiles(), listPartiesGst()]);
  const fy = fiscalYearOf(new Date().toISOString().slice(0, 10))[0].slice(0, 4);
  return (
    <div className="space-y-8">
      <section className={`${card} p-6 space-y-6`}>
        <h3 className="text-sm font-semibold text-white">Our entities</h3>
        {profiles.map((e) => (
          <form key={e.id} action={saveEntityGst} className="grid gap-3 md:grid-cols-5" data-entity-gst={e.name}>
            <input type="hidden" name="entityId" value={e.id} />
            <div className="text-sm text-white md:col-span-5">{e.name}</div>
            <input name="gstin" defaultValue={e.gstin ?? ""} maxLength={15} placeholder="GSTIN" className={input} />
            <select name="stateCode" defaultValue={e.state_code ?? ""} className={input} aria-label="State">
              <option value="">State (from GSTIN)</option>{STATES.map((s) => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
            </select>
            <input name="address" defaultValue={e.address} maxLength={300} placeholder="Billing address" className={input} />
            <input name="prefix" defaultValue={e.invoice_prefix} maxLength={10} placeholder="Prefix" className={input} aria-label={`Invoice prefix, numbers look like ${e.invoice_prefix}/${fy}-…/0001`} />
            <button className={btn}>Save</button>
          </form>
        ))}
      </section>
      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">A customer&apos;s GST details</h3>
        <form action={savePartyGst} className="grid gap-3 md:grid-cols-5">
          <select name="partyId" className={input} aria-label="Party">{parties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.gstin ? ` (${p.gstin})` : ""}</option>)}</select>
          <input name="gstin" maxLength={15} placeholder="GSTIN (blank if unregistered)" className={input} />
          <select name="stateCode" defaultValue="" className={input} aria-label="Customer state">
            <option value="">State (from GSTIN)</option>{STATES.map((s) => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
          </select>
          <input name="address" maxLength={300} placeholder="Billing address" className={input} />
          <button className={btn}>Save</button>
        </form>
      </section>
    </div>
  );
}

async function PayLinks({ invoiceId }: { invoiceId: string }) {
  const [ready, links] = await Promise.all([razorpayReady(), linksFor(invoiceId)]);
  if (!ready) return <p className="print:hidden text-xs text-slate-500">Connect Razorpay under Integrations to collect this invoice online.</p>;
  return (
    <section className={`${card} print:hidden p-6 space-y-3`} data-paylinks>
      <h3 className="text-sm font-semibold text-white">Collect online (Razorpay)</h3>
      {links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
          <code className="break-all rounded bg-slate-950 px-2 py-1 text-slate-200" data-paylink>{l.short_url}</code>
          <span className="text-slate-400">{rupees(decimalToPaise(l.amount))} · {l.status} · {l.created_at}</span>
        </div>
      ))}
      <form action={paymentLink}>
        <input type="hidden" name="id" value={invoiceId} />
        <button className={btn}>{links.length ? "Get link for the amount due" : "Create payment link"}</button>
      </form>
    </section>
  );
}
