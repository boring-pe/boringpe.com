import { requireSection } from "@/lib/dal";
import { VerticalSelect } from "../_shell/vertical-select";
import { VerticalFilter } from "../_shell/vertical-filter";
import { isVertical, verticalLabel } from "@/lib/ops-fields";
import { listEntities } from "@/lib/books";
import { listDeals, listMoney, listParties, unpostedMoneyCount } from "@/lib/ops";
import { CATEGORIES, categoryLabel, inr } from "@/lib/ops-fields";
import { CURRENCIES } from "@/lib/assets-calc";
import { addEntry, postOlderEntries } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  saved: { text: "Recorded." },
  requested: { text: "Payment sent to the Super Admin. It counts once approved." },
  invalid: { text: "That was not valid. Check the amount and category.", bad: true },
  memo: { text: "Say what the payment is for.", bad: true },
  rate: { text: "Give the amount and the rate in rupees per unit, for example 83.45.", bad: true },
  backfilled: { text: "Older entries posted to the books." },
  "books-refused": { text: "The books refused that entry. Nothing was saved.", bad: true },
  "too-many": { text: "You already have 20 requests waiting.", bad: true },
};
const STATUS_STYLE: Record<string, string> = {
  recorded: "text-green-400",
  approved: "text-green-400",
  awaiting_approval: "text-amber-400",
  rejected: "text-red-400",
  withdrawn: "text-slate-500",
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ notice?: string; vertical?: string }> }) {
  const user = await requireSection("money");
  const { notice, vertical: rawVertical } = await searchParams;
  const vertical = isVertical(rawVertical) ? rawVertical : null;
  const [allEntries, deals, parties, entities, unposted] = await Promise.all([
    listMoney(), listDeals(), listParties(), listEntities(), unpostedMoneyCount(),
  ]);
  const entries = allEntries.filter((e) => !vertical || e.vertical === vertical);
  const banner = notice ? NOTICES[notice] : undefined;
  const owner = user.role === "super_admin";

  const sum = (pred: (e: (typeof entries)[number]) => boolean) =>
    entries.filter(pred).reduce((total, e) => total + Number(e.amount), 0);
  const moneyIn = sum((e) => e.direction === "in" && e.status === "recorded");
  const moneyOut = sum((e) => e.direction === "out" && e.status === "approved");
  const waiting = sum((e) => e.status === "awaiting_approval");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Money</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Money in is recorded as it happens and posts to the chosen entity&apos;s books. Money out is a payment
          {owner ? "; as Super Admin yours count immediately." : " and waits for the Super Admin before it counts."}
        </p>
      </div>

      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
          {banner.text}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["In", moneyIn],
          ["Out (approved)", moneyOut],
          ["Awaiting approval", waiting],
        ].map(([label, value]) => (
          <div key={label as string} className={`${card} p-5`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label as string}</div>
            <div className="mt-1 text-xl font-semibold text-white">{inr(value as number)}</div>
          </div>
        ))}
      </div>

      {owner && unposted > 0 ? (
        <form action={postOlderEntries} className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
          <span className="text-sm text-amber-300">{unposted} older {unposted === 1 ? "entry counts" : "entries count"} but {unposted === 1 ? "is" : "are"} not in the books yet.</span>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Post them to the books</button>
        </form>
      ) : null}

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Add an entry</h3>
        <form action={addEntry} className="grid gap-3 md:grid-cols-4">
          <select name="direction" defaultValue="in" className={input} aria-label="Direction">
            <option value="in">Money in</option>
            <option value="out">Payment out</option>
          </select>
          <VerticalSelect className={input} />
          <select name="category" defaultValue="investment" className={input} aria-label="Category">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input name="amount" required inputMode="decimal" placeholder="Amount" className={input} />
          <select name="currency" defaultValue="INR" className={input} aria-label="Currency">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="fxRate" inputMode="decimal" placeholder="₹ per unit (if not INR)" className={input} />
          <input name="date" type="date" className={input} aria-label="Date" />
          <select name="entityId" defaultValue={entities.find((x) => x.kind === "boring_pe")?.id} className={input} aria-label="Entity">
            {entities.map((x) => <option key={x.id} value={x.id}>Books of {x.name}</option>)}
          </select>
          <input name="memo" maxLength={300} placeholder="What is it for?" className={input} />
          <select name="dealId" defaultValue="" className={input} aria-label="Deal">
            <option value="">No deal</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select name="partyId" defaultValue="" className={input} aria-label="Party">
            <option value="">No party</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="md:col-span-4">
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Save
            </button>
          </div>
        </form>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="space-y-3 px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Entries ({entries.length})</h3>
          <VerticalFilter base="/portal/money" current={vertical} />
        </div>
        {entries.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="px-6 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1" data-entry={e.memo || e.id}>
                <span className="text-xs text-slate-500">{e.entry_date}</span>
                <span className={e.direction === "in" ? "text-green-400" : "text-slate-200"}>
                  {e.direction === "in" ? "+" : "-"}{inr(e.amount)}
                </span>
                {e.currency !== "INR" && e.fx_amount ? <span className="text-xs text-slate-400">{e.currency} {e.fx_amount}</span> : null}
                <span className="text-slate-300">{categoryLabel(e.category)}</span>
                {e.vertical ? <span className="rounded-full border border-slate-700 px-2 text-[11px] text-slate-400">{verticalLabel(e.vertical)}</span> : null}
                {e.memo ? <span className="text-slate-400">{e.memo}</span> : null}
                {e.deal_name ? <span className="text-xs text-slate-500">{e.deal_name}</span> : null}
                {e.party_name ? <span className="text-xs text-slate-500">{e.party_name}</span> : null}
                <span className={`text-xs font-semibold ${STATUS_STYLE[e.status]}`}>{e.status.replace("_", " ")}</span>
                {e.entity_name ? <span className="text-xs text-slate-500">{e.entity_name}</span> : null}
                {e.journal_entry_id ? <span className="text-xs text-green-400">in books</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
