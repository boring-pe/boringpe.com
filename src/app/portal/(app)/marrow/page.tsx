import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { balances, decimalToPaise, listEntities } from "@/lib/books";
import { listContributions } from "@/lib/investments";
import { canSeeFirmData } from "@/lib/rbac";
import { addContribution } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  contributed: { text: "Contribution recorded in both sets of books." },
  invalid: { text: "That was not valid. Check the amount, giver and receiver.", bad: true },
  forbidden: { text: "Only the Super Admin records contributions.", bad: true },
  "books-refused": { text: "The books refused that posting.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";

export default async function MarrowPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireSection("marrow");
  const { notice } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const intro = (
    <div>
      <h2 className="text-2xl font-bold text-white">Impact Marrow</h2>
      <p className="mt-2 text-sm text-slate-400 max-w-2xl">
        The social and economic initiative beside Boring PE, funded by Rahul Mane and Boring PE through its own fund.
      </p>
    </div>
  );
  if (!canSeeFirmData(user.role)) return intro;

  const entities = await listEntities();
  const receivers = entities.filter((e) => e.kind === "impact_marrow" || e.kind === "fund");
  const contributions = await listContributions();
  // Bank balance of each receiving entity, from its own books.
  const cash = await Promise.all(
    receivers.map(async (e) => {
      const rows = await balances(e.id, null, null);
      const bank = rows.filter((r) => r.code === "1010" || r.code === "1020").reduce((s, r) => s + r.debit - r.credit, 0n);
      return { name: e.name, bank };
    }),
  );
  const total = contributions.reduce((s, c) => s + decimalToPaise(c.amount), 0n);
  const bySource = new Map<string, bigint>();
  for (const c of contributions) bySource.set(c.from_name ?? "Rahul Mane", (bySource.get(c.from_name ?? "Rahul Mane") ?? 0n) + decimalToPaise(c.amount));

  return (
    <div className="space-y-8">
      {intro}
      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <div className={`${card} p-5`}>
          <div className="text-xs uppercase tracking-wide text-slate-500">Contributed in total</div>
          <div className="mt-1 text-xl font-semibold text-white">{rupees(total)}</div>
          <div className="mt-2 space-y-0.5 text-xs text-slate-400">
            {[...bySource.entries()].map(([k, v]) => <div key={k}>{k}: {rupees(v)}</div>)}
          </div>
        </div>
        {cash.map((c) => (
          <div key={c.name} className={`${card} p-5`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{c.name} · cash</div>
            <div className="mt-1 text-xl font-semibold text-white">{rupees(c.bank)}</div>
          </div>
        ))}
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Date</th><th className={th}>From</th><th className={th}>To</th><th className={`${th} text-right`}>Amount</th><th className={th}>Note</th></tr></thead>
          <tbody>
            {contributions.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">No contributions yet.</td></tr> : contributions.map((c) => (
              <tr key={c.id} className="border-t border-slate-800">
                <td className={td}>{c.contrib_date}</td><td className={td}>{c.from_name ?? "Rahul Mane (personal)"}</td><td className={td}>{c.to_name}</td>
                <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-200">{rupees(decimalToPaise(c.amount))}</td><td className={td}>{c.memo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {user.role === "super_admin" ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-1">Record a contribution</h3>
          <p className="text-xs text-slate-500 mb-4">Posts an expense in the giver&apos;s books and capital in the receiver&apos;s.</p>
          <form action={addContribution} className="grid gap-3 md:grid-cols-3">
            <select name="fromEntityId" defaultValue="" className={input} aria-label="From">
              <option value="">From Rahul Mane (personal)</option>
              {entities.map((e) => <option key={e.id} value={e.id}>From {e.name}</option>)}
            </select>
            <select name="toEntityId" defaultValue={receivers.find((e) => e.kind === "fund")?.id} className={input} aria-label="To">
              {receivers.map((e) => <option key={e.id} value={e.id}>To {e.name}</option>)}
            </select>
            <input name="amount" required inputMode="decimal" placeholder="Amount in ₹" className={input} />
            <input name="date" type="date" className={input} aria-label="Date" />
            <input name="memo" maxLength={200} placeholder="Purpose" className={`${input} md:col-span-2`} />
            <div className="md:col-span-3"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Record contribution</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
