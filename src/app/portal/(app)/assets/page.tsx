import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { ASSET_CATEGORIES, assetCategoryLabel } from "@/lib/assets-calc";
import { listAssets, listRuns } from "@/lib/assets";
import { decimalToPaise, listEntities } from "@/lib/books";
import { canPostBooks } from "@/lib/rbac";
import { bpsLabel } from "@/lib/venture-calc";
import { depreciate, dispose, newAsset } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  added: { text: "Asset added and its purchase posted." },
  "run-ok": { text: "Depreciation posted for the month." },
  "run-exists": { text: "That month's depreciation is already posted.", bad: true },
  "run-nothing": { text: "Nothing to depreciate for that month.", bad: true },
  "run-books-refused": { text: "The books refused that posting.", bad: true },
  disposed: { text: "Asset disposed; gain or loss posted." },
  invalid: { text: "That was not valid. Check the dates and amounts (salvage must be below cost).", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
  "books-refused": { text: "The books refused that posting.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ e?: string; notice?: string }> }) {
  const user = await requireSection("assets");
  const sp = await searchParams;
  const entities = await listEntities();
  const entity = entities.find((x) => x.id === sp.e) ?? entities[0];
  const post = canPostBooks(user.role);
  const [assets, runs] = await Promise.all([listAssets(entity.id), listRuns(entity.id)]);
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const totals = assets.filter((a) => a.status === "active").reduce(
    (t, a) => ({ cost: t.cost + decimalToPaise(a.cost), acc: t.acc + decimalToPaise(a.accumulated) }), { cost: 0n, acc: 0n },
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Fixed assets</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">The asset register of each entity. Buying, monthly depreciation and disposal all post to its books.</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}
      <nav aria-label="Entities" className="flex flex-wrap gap-2">
        {entities.map((x) => <Link key={x.id} href={`/portal/assets?e=${x.id}`} className={`rounded-full border px-3 py-1 text-sm ${x.id === entity.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>{x.name}</Link>)}
      </nav>
      <div className="grid gap-4 md:grid-cols-3" data-asset-totals>
        {[["Cost", totals.cost], ["Accumulated depreciation", totals.acc], ["Book value", totals.cost - totals.acc]].map(([l, v]) => (
          <div key={l as string} className={`${card} p-5`}><div className="text-xs uppercase tracking-wide text-slate-500">{l as string}</div><div className="mt-1 text-xl font-semibold text-white">{rupees(v as bigint)}</div></div>
        ))}
      </div>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Asset</th><th className={th}>Bought</th><th className={th}>Method</th><th className={`${th} text-right`}>Cost</th><th className={`${th} text-right`}>Depreciated</th><th className={`${th} text-right`}>Book value</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {assets.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-sm text-slate-500">No assets yet.</td></tr> : assets.map((a) => {
              const cost = decimalToPaise(a.cost), acc = decimalToPaise(a.accumulated);
              return (
                <tr key={a.id} className="border-t border-slate-800 align-top" data-asset={a.name}>
                  <td className={td}>{a.name}<div className="text-xs text-slate-500">{assetCategoryLabel(a.category)}</div></td>
                  <td className={td}>{a.purchase_date}</td>
                  <td className={td}>{a.method === "slm" ? `Straight line, ${a.life_months} months` : `WDV ${bpsLabel(a.wdv_bps)} a year`}</td>
                  <td className={num}>{rupees(cost)}</td><td className={num}>{rupees(acc)}</td><td className={num}>{rupees(a.status === "active" ? cost - acc : 0n)}</td>
                  <td className={td}>
                    {a.status === "disposed" ? `Disposed ${a.disposed_on} for ${a.proceeds ? rupees(decimalToPaise(a.proceeds)) : "₹0"}` : post ? (
                      <form action={dispose} className="flex flex-wrap gap-2">
                        <input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="assetId" value={a.id} />
                        <input name="date" type="date" defaultValue={today} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" aria-label="Disposal date" />
                        <input name="proceeds" inputMode="decimal" placeholder="Sold for ₹ (0 if scrapped)" className="w-40 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
                        <button className="text-xs text-red-300 hover:text-red-200">Dispose</button>
                      </form>
                    ) : "Active"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {post ? (
        <>
          <section className={`${card} p-6`}>
            <h3 className="text-sm font-semibold text-white mb-1">Post depreciation for a month</h3>
            <p className="text-xs text-slate-500 mb-4">Runs once per month for all of {entity.name}&apos;s assets. {runs.length ? `Last posted: ${runs[0].period.slice(0, 7)}.` : ""}</p>
            <form action={depreciate} className="flex flex-wrap gap-3">
              <input type="hidden" name="entityId" value={entity.id} />
              <input name="month" type="month" defaultValue={lastMonth} className={`${input} w-auto`} aria-label="Month" />
              <button className={btn}>Post depreciation</button>
            </form>
            {runs.length ? <ul className="mt-4 text-sm text-slate-400">{runs.slice(0, 6).map((r) => <li key={r.id} data-run={r.period.slice(0, 7)}>{r.period.slice(0, 7)}: {rupees(decimalToPaise(r.total))}</li>)}</ul> : null}
          </section>
          <section className={`${card} p-6`}>
            <h3 className="text-sm font-semibold text-white mb-1">Add an asset</h3>
            <p className="text-xs text-slate-500 mb-4">Leave life or rate blank to use the category&apos;s usual one (Income Tax WDV rates; Companies Act lives).</p>
            <form action={newAsset} className="grid gap-3 md:grid-cols-4">
              <input type="hidden" name="entityId" value={entity.id} />
              <input name="name" required maxLength={120} placeholder="e.g. MacBook Pro for Rahul" className={`${input} md:col-span-2`} />
              <select name="category" defaultValue="computers" className={input} aria-label="Category">
                {ASSET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <label className="text-xs text-slate-500">Bought on<input name="purchaseDate" type="date" required defaultValue={today} className={`${input} mt-1`} /></label>
              <input name="cost" required inputMode="decimal" placeholder="Cost ₹" className={input} />
              <input name="salvage" inputMode="decimal" placeholder="Salvage ₹ (0)" className={input} />
              <select name="method" defaultValue="slm" className={input} aria-label="Method"><option value="slm">Straight line</option><option value="wdv">Written-down value</option></select>
              <input name="lifeMonths" inputMode="numeric" placeholder="Life in months" className={input} />
              <input name="wdvPercent" inputMode="decimal" placeholder="WDV % a year" className={input} />
              <select name="paid" defaultValue="bank" className={input} aria-label="Paid"><option value="bank">Paid from bank</option><option value="credit">Bought on credit</option></select>
              <div className="md:col-span-4"><button className={btn}>Add asset</button></div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
