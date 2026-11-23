import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { decimalToPaise, listEntities } from "@/lib/books";
import { pillarLabel } from "@/lib/ops-fields";
import { canManagePortfolio, canPostBooks, canSeeFirmData } from "@/lib/rbac";
import { bpsLabel } from "@/lib/venture-calc";
import { listOperators, listPeriods, listVentures, operatorUsers, type VentureRow } from "@/lib/ventures";
import { addVenture, addVentureOperator, closeVenturePeriod, payOperator } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  "venture-added": { text: "Venture added. Add its operators next." },
  "operator-added": { text: "Operator added." },
  closed: { text: "Month closed and posted to the books." },
  paid: { text: "Operator paid and posted to the books." },
  invalid: { text: "That was not valid. Check the fields.", bad: true },
  fee: { text: "Give the fee amount or percentage, or choose no fee.", bad: true },
  exists: { text: "A venture with that name already exists.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
  "over-100": { text: "Shares on the same basis cannot add up to more than 100%.", bad: true },
  "period-exists": { text: "That month is already closed for this venture.", bad: true },
  "already-paid": { text: "That share is already paid.", bad: true },
  "books-refused": { text: "The books refused that posting. Check the entity's chart of accounts.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const r = (d: string) => rupees(decimalToPaise(d));

function feeText(v: VentureRow) {
  if (v.entity_kind === "boring_pe") return "No fee: runs inside Boring PE";
  if (v.fee_type === "fixed") return `${r(v.fee_fixed)} a month`;
  if (v.fee_type === "percent") return `${bpsLabel(v.fee_bps)} of revenue`;
  return "No fee";
}

export default async function VenturesPage({ searchParams }: { searchParams: Promise<{ v?: string; notice?: string }> }) {
  const user = await requireSection("ventures");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const firm = canSeeFirmData(user.role);
  const ventures = await listVentures(firm ? null : user.id);
  const selected = sp.v ? ventures.find((v) => v.id === sp.v) ?? null : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Ventures</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          {firm
            ? "Build and Co-Build ventures run by operators on revenue or profit sharing. Each month is closed into a statement that posts to the books, with the Business Studio fee charged by Enable."
            : "Statements of the ventures you operate, with your share for each month."}
        </p>
      </div>
      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}

      {sp.v ? (
        selected ? <VentureDetail v={selected} userId={user.id} firm={firm} manage={canManagePortfolio(user.role)} post={canPostBooks(user.role)} owner={user.role === "super_admin"} />
          : <p className="text-sm text-slate-500">That venture was not found.</p>
      ) : (
        <>
          <section className={`${card} overflow-x-auto`}>
            <table className="w-full">
              <thead><tr><th className={th}>Venture</th><th className={th}>Vertical</th><th className={th}>Books</th><th className={th}>Business Studio fee</th><th className={th}>Status</th></tr></thead>
              <tbody>
                {ventures.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">{firm ? "No ventures yet." : "You are not linked to a venture yet."}</td></tr> : ventures.map((v) => (
                  <tr key={v.id} className="border-t border-slate-800">
                    <td className={td}><Link href={`/portal/ventures?v=${v.id}`} className="text-blue-300 hover:text-blue-200">{v.name}</Link></td>
                    <td className={td}>{pillarLabel(v.pillar)}</td><td className={td}>{v.entity_name}</td><td className={td}>{feeText(v)}</td>
                    <td className={`${td} capitalize`}>{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {canManagePortfolio(user.role) ? <AddVenture /> : null}
        </>
      )}
    </div>
  );
}

async function AddVenture() {
  const entities = await listEntities();
  return (
    <section className={`${card} p-6`}>
      <h3 className="text-sm font-semibold text-white mb-1">Add a venture</h3>
      <p className="text-xs text-slate-500 mb-4">A venture inside Boring PE pays no fee to itself. Give it its own SPV when equity is shared.</p>
      <form action={addVenture} className="grid gap-3 md:grid-cols-3">
        <input name="name" required maxLength={120} placeholder="Venture name" className={input} />
        <select name="pillar" defaultValue="build" className={input} aria-label="Vertical">
          <option value="build">Build</option><option value="co_build">Co-Build</option>
        </select>
        <select name="entityId" defaultValue={entities[0]?.id} className={input} aria-label="Books">
          {entities.map((e) => <option key={e.id} value={e.id}>Books of {e.name}</option>)}
        </select>
        <select name="feeType" defaultValue="none" className={input} aria-label="Fee">
          <option value="none">No Business Studio fee</option><option value="fixed">Fixed fee a month</option><option value="percent">Percent of revenue</option>
        </select>
        <input name="feeFixed" inputMode="decimal" placeholder="Fixed fee ₹ a month" className={input} />
        <input name="feePercent" inputMode="decimal" placeholder="Fee % of revenue" className={input} />
        <input name="notes" maxLength={300} placeholder="Notes" className={`${input} md:col-span-3`} />
        <div className="md:col-span-3"><button className={btn}>Add venture</button></div>
      </form>
    </section>
  );
}

async function VentureDetail({ v, userId, firm, manage, post, owner }: {
  v: VentureRow; userId: string; firm: boolean; manage: boolean; post: boolean; owner: boolean;
}) {
  const [operators, periods, users] = await Promise.all([listOperators(v.id), listPeriods(v.id), manage ? operatorUsers() : Promise.resolve([])]);
  // An operator sees the venture's figures but only their own share.
  const mine = new Set(operators.filter((o) => o.user_id === userId).map((o) => o.id));
  const visibleOps = firm ? operators : operators.filter((o) => mine.has(o.id));
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-white">{v.name}</h3>
        <p className="text-sm text-slate-400">{pillarLabel(v.pillar)} · books of {v.entity_name} · {feeText(v)}</p>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Operator</th><th className={th}>Share</th>{firm ? <th className={th}>Signs in as</th> : null}</tr></thead>
          <tbody>
            {visibleOps.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-sm text-slate-500">No operators yet.</td></tr> : visibleOps.map((o) => (
              <tr key={o.id} className="border-t border-slate-800">
                <td className={td}>{o.name}</td><td className={td}>{bpsLabel(o.share_bps)} of {o.basis}</td>
                {firm ? <td className={td}>{o.user_email ?? "–"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {manage ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">Add an operator</h3>
          <form action={addVentureOperator} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="ventureId" value={v.id} />
            <input name="name" required maxLength={120} placeholder="Operator name" className={input} />
            <select name="basis" defaultValue="profit" className={input} aria-label="Basis">
              <option value="profit">Share of profit</option><option value="revenue">Share of revenue</option>
            </select>
            <input name="percent" required inputMode="decimal" placeholder="Share %" className={input} />
            <select name="userId" defaultValue="" className={input} aria-label="Portal login">
              <option value="">No portal login</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
            <div className="md:col-span-4"><button className={btn}>Add operator</button></div>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Monthly statements</h3>
        {periods.length === 0 ? <p className="text-sm text-slate-500">No months closed yet.</p> : null}
        {periods.map((p) => {
          const payouts = p.payouts.filter((x) => firm || mine.has(x.operator_id));
          return (
            <article key={p.id} className={`${card} p-4`} data-period={p.period.slice(0, 7)}>
              <div className="text-sm font-semibold text-white">{p.period.slice(0, 7)}</div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-5">
                <div><span className="text-slate-500">Revenue </span><span className="text-slate-200">{r(p.revenue)}</span></div>
                <div><span className="text-slate-500">Costs </span><span className="text-slate-200">{r(p.costs)}</span></div>
                <div><span className="text-slate-500">Business Studio fee </span><span className="text-slate-200">{r(p.fee)}</span></div>
                {firm ? <div><span className="text-slate-500">Operators </span><span className="text-slate-200">{r(p.operator_total)}</span></div> : null}
                {firm ? <div><span className="text-slate-500">Net to venture </span><span className="text-slate-200">{r(p.net)}</span></div> : null}
              </div>
              {payouts.length ? (
                <table className="mt-3 w-full">
                  <tbody>
                    {payouts.map((x) => (
                      <tr key={x.id} className="border-t border-slate-800" data-payout={x.operator_name}>
                        <td className="py-1 text-sm text-slate-300">{x.operator_name}</td>
                        <td className="py-1 text-sm text-right tabular-nums text-slate-200">{r(x.amount)}</td>
                        <td className="py-1 text-right text-sm">
                          {x.paid_on ? <span className="text-green-400">Paid {x.paid_on}</span> : owner ? (
                            <form action={payOperator} className="inline">
                              <input type="hidden" name="ventureId" value={v.id} />
                              <input type="hidden" name="payoutId" value={x.id} />
                              <input type="hidden" name="date" value={today} />
                              <button className="text-xs text-blue-300 hover:text-blue-200">Mark paid</button>
                            </form>
                          ) : <span className="text-amber-400">Due</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </article>
          );
        })}
      </section>

      {post ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-1">Close a month</h3>
          <p className="text-xs text-slate-500 mb-4">
            Posts revenue and costs to {v.entity_name}&apos;s books, operator shares and the fee as payables, and the fee as income in Boring PE&apos;s books.
          </p>
          <form action={closeVenturePeriod} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="ventureId" value={v.id} />
            <input name="month" type="month" required defaultValue={lastMonth} className={input} aria-label="Month" />
            <input name="revenue" inputMode="decimal" placeholder="Revenue ₹" className={input} />
            <input name="costs" inputMode="decimal" placeholder="Direct costs ₹" className={input} />
            <button className={btn}>Close month</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
