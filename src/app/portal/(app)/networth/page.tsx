import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { entityKindLabel, rupees } from "@/lib/accounting";
import { requireSection } from "@/lib/dal";
import { fiscalYearOf } from "@/lib/hr-calc";
import { netWorthReport, netWorthTrend, type TrendPoint } from "@/lib/networth";
import { change, findNode, flatten, pathTo, type Figures, type Node } from "@/lib/networth-calc";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none";
const th = "px-2.5 py-2 text-right text-xs uppercase tracking-wide text-slate-500 whitespace-nowrap";
const num = "px-2.5 py-2 text-right text-[13px] tabular-nums whitespace-nowrap";
const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const tone = (v: bigint) => (v < 0n ? "text-red-400" : "text-slate-200");

const levelNote = (n: Node) =>
  n.level === "all" ? `${n.children.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1")} together`
  : n.level === "workspace" ? `Every unit in ${n.name}`
  : `${entityKindLabel(n.kind ?? "")}${n.children.length ? `, with ${n.children.length} unit${n.children.length === 1 ? "" : "s"} under it` : ""}`;

function Kpi({ k, label, value, note, negative }: { k: string; label: string; value: string; note?: string; negative?: boolean }) {
  return (
    <div className={`${card} p-5`} data-kpi={k}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${negative ? "text-red-400" : "text-white"}`}>{value}</div>
      {note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

/** Net worth as a line and each month's income and expenses as bars, drawn without a library. */
function Trend({ points }: { points: TrendPoint[] }) {
  const W = 720, H = 220, top = 12, mid = 130, bottom = 200, left = 8, right = 8;
  const step = (W - left - right) / points.length;
  const worth = points.flatMap((p) => [p.netWorth, p.marketNetWorth]);
  let lo = worth.reduce((m, v) => (v < m ? v : m), worth[0] ?? 0n);
  let hi = worth.reduce((m, v) => (v > m ? v : m), worth[0] ?? 0n);
  if (lo === hi) { lo -= 100n; hi += 100n; }
  const y = (v: bigint) => top + Number(((hi - v) * 10000n) / (hi - lo)) / 10000 * (mid - top);
  const x = (i: number) => left + step * i + step / 2;
  const line = (f: (p: TrendPoint) => bigint) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");
  const flowMax = points.reduce((m, p) => (p.income > m ? p.income : p.expense > m ? p.expense : m), 1n);
  const bar = (v: bigint) => (v > 0n ? Number((v * 10000n) / flowMax) / 10000 * (bottom - mid - 14) : 0);
  const bw = Math.max(3, step / 2 - 3);
  const marketDiffers = points.some((p) => p.marketNetWorth !== p.netWorth);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Net worth, income and expenses by month">
        <line x1={left} x2={W - right} y1={mid} y2={mid} className="stroke-slate-800" />
        {lo < 0n && hi > 0n ? <line x1={left} x2={W - right} y1={y(0n)} y2={y(0n)} className="stroke-slate-700" strokeDasharray="2 4" /> : null}
        {marketDiffers ? <path d={line((p) => p.marketNetWorth)} fill="none" className="stroke-emerald-500" strokeWidth={2} strokeDasharray="5 4" /> : null}
        <path d={line((p) => p.netWorth)} fill="none" className="stroke-blue-500" strokeWidth={2.5} />
        {points.map((p, i) => (
          <g key={p.month}>
            <circle cx={x(i)} cy={y(p.netWorth)} r={3} className="fill-blue-500"><title>{`${p.month}: net worth ${rupees(p.netWorth)}`}</title></circle>
            <rect x={x(i) - bw - 1} y={bottom - bar(p.income)} width={bw} height={bar(p.income)} rx={2} className="fill-blue-400/70"><title>{`${p.month}: income ${rupees(p.income)}`}</title></rect>
            <rect x={x(i) + 1} y={bottom - bar(p.expense)} width={bw} height={bar(p.expense)} rx={2} className="fill-slate-500/70"><title>{`${p.month}: expenses ${rupees(p.expense)}`}</title></rect>
            {(points.length - 1 - i) % 2 ? null : <text x={x(i)} y={H - 4} textAnchor="middle" className="fill-slate-500 text-[10px]">{p.month.slice(2)}</text>}
          </g>
        ))}
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-blue-500 align-middle" />Net worth (book)</span>
        {marketDiffers ? <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-emerald-500 align-middle" />At market value</span> : null}
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-blue-400/70 align-middle" />Income</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-slate-500/70 align-middle" />Expenses</span>
      </p>
    </div>
  );
}

export default async function NetWorthPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; n?: string }> }) {
  await requireSection("networth");
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const [fyFrom] = fiscalYearOf(today);
  const from = isDate(sp.from) ?? fyFrom;
  const to = isDate(sp.to) ?? today;
  const r = await netWorthReport(from, to);
  const node = (sp.n && findNode(r.tree, sp.n)) || (r.tree.children.length === 1 ? r.tree.children[0] : r.tree);
  const f = r.figures.get(node.key)!;
  const trend = await netWorthTrend(node, to);
  const path = pathTo(r.tree, node.key);
  const rows = flatten(r.tree).filter((n) => !(n.level === "all" && r.tree.children.length === 1));
  const q = (n: string) => `/portal/networth?n=${encodeURIComponent(n)}&from=${from}&to=${to}`;
  const yearAgo = trend[0];
  const moved = change(yearAgo?.netWorth ?? 0n, f.netWorth);
  const internal = f.internal.fees + f.internal.transfers + f.internal.stakesCost;
  const children = node.children.map((c) => ({ c, f: r.figures.get(c.key)! }));
  const positive = children.reduce((s, x) => s + (x.f.netWorth > 0n ? x.f.netWorth : 0n), 0n);

  return (
    <div className="space-y-6" data-networth={node.key}>
      <div>
        <h2 className="text-2xl font-bold text-white">Net worth</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          What each level owns and owes, and what it earned and spent, from the books. Pick any level, from everything together down to a single unit.
          Balances are at {to}; income and expenses run from {from}.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="n" value={node.key} />
        <label className="text-xs text-slate-500">From<input name="from" type="date" defaultValue={from} className={`${input} mt-1`} /></label>
        <label className="text-xs text-slate-500">To<input name="to" type="date" defaultValue={to} className={`${input} mt-1`} /></label>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Update</button>
        <a href={`/portal/networth/export?from=${from}&to=${to}`} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white">Download CSV</a>
      </form>

      <section className="space-y-4">
        <div>
          {path.length > 1 ? <nav aria-label="Level" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {path.map((p, i) => (
              <span key={p.key} className="inline-flex items-center gap-1">
                {i ? <ChevronRight className="h-3 w-3" /> : null}
                {p.key === node.key ? <span className="text-slate-300">{p.name}</span> : <Link href={q(p.key)} className="hover:text-blue-300">{p.name}</Link>}
              </span>
            ))}
          </nav> : null}
          <h3 className="mt-1 text-lg font-semibold text-white" data-level-name>{node.name}</h3>
          <p className="text-xs text-slate-500">{levelNote(node)}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi k="networth" label="Net worth" value={rupees(f.netWorth)} negative={f.netWorth < 0n}
            note={moved === null ? "Assets less liabilities, at book value" : `${moved >= 0 ? "Up" : "Down"} ${Math.abs(moved).toFixed(1)}% since ${yearAgo.month}`} />
          <Kpi k="market" label="At market value" value={rupees(f.marketNetWorth)} negative={f.marketNetWorth < 0n}
            note={f.value === f.cost ? "Investments at cost; no newer valuation" : `Investments at ${rupees(f.value)} instead of ${rupees(f.cost)}`} />
          <Kpi k="assets" label="Assets" value={rupees(f.assets)} note={`Liabilities ${rupees(f.liabilities)}`} />
          <Kpi k="net" label={f.net >= 0n ? "Surplus for the period" : "Deficit for the period"} value={rupees(f.net)} negative={f.net < 0n}
            note={`Income ${rupees(f.income)} · expenses ${rupees(f.expense)}`} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <section className={`${card} p-5`} data-trend>
          <h3 className="text-sm font-semibold text-white">Twelve months to {to.slice(0, 7)}</h3>
          <div className="mt-3"><Trend points={trend} /></div>
        </section>

        <section className={`${card} p-5`} data-breakdown>
          <h3 className="text-sm font-semibold text-white">{children.length ? "What makes it up" : "This unit"}</h3>
          {children.length ? (
            <ul className="mt-3 space-y-3">
              {children.map(({ c, f: cf }) => (
                <li key={c.key} data-part={c.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <Link href={q(c.key)} className="truncate text-white hover:text-blue-300">{c.name}</Link>
                    <span className={`tabular-nums ${tone(cf.netWorth)}`}>{rupees(cf.netWorth)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${positive > 0n && cf.netWorth > 0n ? Number((cf.netWorth * 1000n) / positive) / 10 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Investments at cost</dt><dd className="text-right tabular-nums text-slate-200">{rupees(f.cost)}</dd>
              <dt className="text-slate-500">Their latest value</dt><dd className="text-right tabular-nums text-slate-200">{rupees(f.value)}</dd>
              <dt className="text-slate-500">Income</dt><dd className="text-right tabular-nums text-slate-200">{rupees(f.income)}</dd>
              <dt className="text-slate-500">Expenses</dt><dd className="text-right tabular-nums text-slate-200">{rupees(f.expense)}</dd>
            </dl>
          )}
          {internal > 0n ? (
            <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500" data-internal>
              <div className="font-medium text-slate-400">Counted once inside this level</div>
              <ul className="mt-1 space-y-0.5">
                {f.internal.stakesCost > 0n ? <li>Stakes in units inside it, {rupees(f.internal.stakesCost)} at cost: their own books already carry them</li> : null}
                {f.internal.fees > 0n ? <li>Boring Stack fees, {rupees(f.internal.fees)}: income and expense inside it</li> : null}
                {f.internal.transfers > 0n ? <li>Gifts between its units, {rupees(f.internal.transfers)}: not an expense of the whole</li> : null}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <h3 className="px-3 pt-4 text-sm font-semibold text-white">Every level</h3>
        <table className="mt-2 w-full">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Level</th><th className={th}>Assets</th><th className={th}>Liabilities</th><th className={th}>Net worth</th>
              <th className={th}>At market</th><th className={th}>Income</th><th className={th}>Expenses</th><th className={th}>Surplus</th>
              <th className={th}>Investments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const x: Figures = r.figures.get(n.key)!;
              const here = n.key === node.key;
              const strong = n.level !== "unit" || n.children.length > 0;
              return (
                <tr key={n.key} className={`border-t border-slate-800 ${here ? "bg-blue-500/10" : ""} ${strong ? "font-semibold" : ""}`} data-level={n.key} data-level-label={n.name}>
                  <td className="px-2.5 py-2 text-sm">
                    <Link href={q(n.key)} className={`block whitespace-nowrap hover:text-blue-300 ${here ? "text-blue-300" : "text-white"}`} style={{ paddingLeft: `${Math.max(0, n.depth - (r.tree.children.length === 1 ? 1 : 0)) * 1.1}rem` }}>
                      {n.name}
                      {n.level !== "unit" || n.children.length ? (
                        <span className="ml-2 rounded-full border border-slate-700 px-1.5 text-[10px] font-normal uppercase tracking-wide text-slate-500">
                          {n.level === "all" ? "total" : n.level === "workspace" ? "workspace" : "with its units"}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className={`${num} text-slate-300`}>{rupees(x.assets)}</td>
                  <td className={`${num} text-slate-300`}>{rupees(x.liabilities)}</td>
                  <td className={`${num} ${tone(x.netWorth)}`}>{rupees(x.netWorth)}</td>
                  <td className={`${num} ${tone(x.marketNetWorth)}`}>{rupees(x.marketNetWorth)}</td>
                  <td className={`${num} text-slate-300`}>{rupees(x.income)}</td>
                  <td className={`${num} text-slate-300`}>{rupees(x.expense)}</td>
                  <td className={`${num} ${tone(x.net)}`}>{rupees(x.net)}</td>
                  <td className={`${num} text-slate-300`} data-investments>
                    {rupees(x.value)}
                    {x.cost !== x.value ? <div className="text-[11px] font-normal text-slate-500">cost {rupees(x.cost)}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-3 pb-4 pt-2 text-xs text-slate-500">
          A level&apos;s figures are its units added up, with money that moves inside it counted once. Net worth is assets less liabilities as booked; at market,
          investments count at their latest valuation instead of what was paid. Investments shows what a level holds in companies outside it, at value, with the cost when it differs.
        </p>
      </section>
    </div>
  );
}
