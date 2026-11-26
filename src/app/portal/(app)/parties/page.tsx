import Link from "next/link";
import { Contact } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { decimalToPaise } from "@/lib/books";
import { rupees } from "@/lib/accounting";
import { listParties } from "@/lib/workflows";
import { PARTY_KINDS } from "@/lib/ops-fields";
import { DEAL_NOTICES } from "@/lib/notices";
import { addParty } from "../deals/actions";
import { FilterBar } from "../_shell/filter-bar";
import { EmptyState, StatusChip } from "../_shell/status";
import { SubmitButton } from "../_shell/buttons";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

/** Everyone we deal with, each opening to one page with everything done with them. */
export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireSection("parties");
  const { notice } = await searchParams;
  const parties = await listParties();
  const banner = notice ? DEAL_NOTICES[notice] : undefined;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-white">Contacts</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Companies, people, funds and vendors. Each one opens to their deals, invoices, money, KYC, documents, tasks and WhatsApp, on one page.</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}

      <section id="add" className={`${card} scroll-mt-28 p-6`}>
        <h3 className="mb-4 text-sm font-semibold text-white">Add a contact</h3>
        <form action={addParty} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="from" value="parties" />
          <input name="name" required minLength={2} maxLength={120} placeholder="Company, person, fund or vendor" className={input} />
          <select name="kind" defaultValue="company" className={input} aria-label="Kind">{PARTY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          <input name="email" type="email" maxLength={254} placeholder="Email (optional)" className={input} />
          <SubmitButton pending="Adding…">Add contact</SubmitButton>
        </form>
      </section>

      <section className={`${card} overflow-hidden`}>
        {parties.length === 0 ? (
          <div className="p-6"><EmptyState compact icon={Contact} title="No contacts yet" body="Add the companies and people you deal with; deals, invoices and KYC then hang off them." action={{ label: "Add a contact", href: "#add" }} /></div>
        ) : (
          <>
            <FilterBar list="parties" placeholder="Search names and emails" noun={["contact", "contacts"]} chips={[{ id: "company", label: "Companies" }, { id: "person", label: "People" }, { id: "fund", label: "Funds" }, { id: "vendor", label: "Vendors" }, { id: "owes", label: "Owes us" }, { id: "nokyc", label: "No KYC" }]} />
            <ul className="divide-y divide-slate-800" data-filter-list="parties">
              {parties.map((p) => {
                const owed = decimalToPaise(p.owed);
                return (
                  <li key={p.id} data-row data-tags={`${p.kind}${owed > 0n ? " owes" : ""}${p.kyc_status ? "" : " nokyc"}`} data-party={p.name}>
                    <Link href={`/portal/parties/${p.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 transition-colors hover:bg-slate-800/40">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-white">{p.name}</span>
                        <span className="block text-xs capitalize text-slate-500">{p.kind}{p.email ? <span className="normal-case"> · {p.email}</span> : null}</span>
                      </span>
                      <span className="text-xs text-slate-400">{p.deals} deal{p.deals === 1 ? "" : "s"}{p.open_deals ? `, ${p.open_deals} open` : ""}</span>
                      {owed > 0n ? <span className="text-xs tabular-nums text-slate-300">{rupees(owed)} owed</span> : null}
                      {p.kyc_status ? <StatusChip status={p.kyc_status} label={`KYC ${p.kyc_status.replace(/_/g, " ")}`} /> : <span className="text-xs text-slate-500">No KYC</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
