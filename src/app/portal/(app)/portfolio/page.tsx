import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { ENTITY_KINDS, rupees } from "@/lib/accounting";
import { decimalToPaise, listEntities } from "@/lib/books";
import { getHolding, listCapTable, listHoldings, toTxns, type HoldingRow } from "@/lib/investments";
import { pillarLabel } from "@/lib/ops-fields";
import { ASSET_CLASSES, INSTRUMENTS, assetClassLabel, capTable, instrumentLabel, position } from "@/lib/portfolio-calc";
import { canManagePortfolio, canSeeFirmData } from "@/lib/rbac";
import { ROLE_META, isRole } from "@/lib/rbac";
import { SCOPE_LABEL, externalUsers, listScopes, myView } from "@/lib/scopes";
import { listVentures } from "@/lib/ventures";
import { addAccess, addCap, addHolding, addHoldingTxn, dropAccess } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  "holding-added": { text: "Holding added. Record the investment below." },
  "txn-invest": { text: "Investment recorded and posted to the books." },
  "txn-income": { text: "Income recorded and posted to the books." },
  "txn-exit": { text: "Exit recorded and posted to the books." },
  "txn-valuation": { text: "Valuation recorded." },
  "cap-added": { text: "Cap table updated." },
  invalid: { text: "That was not valid. Check the amounts and fields.", bad: true },
  forbidden: { text: "You do not have permission for that. Investing and exiting are for the Super Admin.", bad: true },
  exited: { text: "This holding is exited.", bad: true },
  "too-much-cost": { text: "An exit cannot recover more cost than is still held.", bad: true },
  "access-added": { text: "Linked. They see it the next time they open the portal." },
  "access-removed": { text: "Link removed." },
  "access-invalid": { text: "Choose an external person (LP, founder, operator or Co-Build partner) and one item.", bad: true },
  "cost-left": { text: "To mark it fully exited, recover all the remaining cost in this exit.", bad: true },
  "books-refused": { text: "The books refused that posting. Check the entity's chart of accounts.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";
const moic = (m: number | null) => (m === null ? "–" : `${m.toFixed(2)}x`);
const kindLabel = (id: string) => ENTITY_KINDS.find((k) => k.id === id)?.label ?? id;

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; h?: string; e?: string; notice?: string }>;
}) {
  const user = await requireSection("portfolio");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;

  if (!canSeeFirmData(user.role)) return <MyPortfolio userId={user.id} />;

  const view = sp.view === "cap" || sp.view === "access" ? sp.view : "holdings";
  const manage = canManagePortfolio(user.role);
  const owner = user.role === "super_admin";
  const entities = await listEntities();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Portfolio</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          What each entity holds, across every asset class, and who owns our SPVs and ventures. Investing,
          income and exits post to the holder&apos;s books.
        </p>
      </div>

      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
          {banner.text}
        </p>
      ) : null}

      <nav aria-label="Portfolio sections" className="flex gap-1 border-b border-slate-800">
        {[
          ["holdings", "Holdings", "/portal/portfolio"],
          ["cap", "Cap tables", "/portal/portfolio?view=cap"],
          ...(manage ? [["access", "Access links", "/portal/portfolio?view=access"]] : []),
        ].map(([id, label, href]) => (
          <Link key={id} href={href} className={`px-4 py-2 text-sm -mb-px border-b-2 ${view === id && !sp.h ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {sp.h ? <HoldingDetail id={sp.h} manage={manage} owner={owner} /> : view === "access" && manage ? (
        <AccessLinks entities={entities} />
      ) : view === "cap" ? (
        <CapTables entities={entities} selected={sp.e} manage={manage} />
      ) : (
        <Holdings entities={entities} manage={manage} />
      )}
    </div>
  );
}

async function Holdings({ entities, manage }: { entities: Awaited<ReturnType<typeof listEntities>>; manage: boolean }) {
  const holdings = await listHoldings();
  const rows = holdings.map((h) => ({ h, p: position(toTxns(h)) }));
  const sum = (f: (p: ReturnType<typeof position>) => bigint) => rows.reduce((s, r) => s + f(r.p), 0n);
  const invested = sum((p) => p.invested);
  const value = sum((p) => p.currentValue);
  const returned = sum((p) => p.proceeds + p.income);
  const overall = invested > 0n ? Number(((value + returned) * 10000n) / invested) / 10000 : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        {[["Invested", rupees(invested)], ["Current value", rupees(value)], ["Returned (exits and income)", rupees(returned)], ["Overall MOIC", moic(overall)]].map(([label, v]) => (
          <div key={label} className={`${card} p-5`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold text-white">{v}</div>
          </div>
        ))}
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr>
            <th className={th}>Holding</th><th className={th}>Held by</th><th className={th}>Class</th><th className={th}>Vertical</th>
            <th className={`${th} text-right`}>Invested</th><th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>MOIC</th><th className={th}>Status</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-sm text-slate-500">No holdings yet.</td></tr>
            ) : rows.map(({ h, p }) => (
              <tr key={h.id} className="border-t border-slate-800" data-holding={h.name}>
                <td className={td}><Link href={`/portal/portfolio?h=${h.id}`} className="text-blue-300 hover:text-blue-200">{h.name}</Link></td>
                <td className={td}>{h.holder_name}</td><td className={td}>{assetClassLabel(h.asset_class)}</td><td className={td}>{pillarLabel(h.pillar)}</td>
                <td className={num}>{rupees(p.invested)}</td><td className={num}>{rupees(p.currentValue)}</td><td className={num}>{moic(p.moic)}</td>
                <td className={`${td} capitalize`}>{h.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {manage ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">Add a holding</h3>
          <form action={addHolding} className="grid gap-3 md:grid-cols-3">
            <input name="name" required maxLength={120} placeholder="Name, e.g. Acme Foods Pvt Ltd" className={input} />
            <select name="holderEntityId" defaultValue={entities[0]?.id} className={input} aria-label="Held by">
              {entities.map((e) => <option key={e.id} value={e.id}>Held by {e.name}</option>)}
            </select>
            <select name="assetClass" defaultValue="startup" className={input} aria-label="Asset class">
              {ASSET_CLASSES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <select name="pillar" defaultValue="own" className={input} aria-label="Vertical">
              {(["own", "build", "co_build"] as const).map((p) => <option key={p} value={p}>{pillarLabel(p)}</option>)}
            </select>
            <select name="targetEntityId" defaultValue="" className={input} aria-label="Our entity invested in">
              <option value="">External (not one of our entities)</option>
              {(await listEntities("enterable")).map((e) => <option key={e.id} value={e.id}>Into {e.name} ({kindLabel(e.kind)})</option>)}
            </select>
            <input name="notes" maxLength={300} placeholder="Notes" className={input} />
            <div className="md:col-span-3"><button className={btn}>Add holding</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function HoldingDetail({ id, manage, owner }: { id: string; manage: boolean; owner: boolean }) {
  const h: HoldingRow | null = await getHolding(id);
  if (!h) return <p className="text-sm text-slate-500">That holding was not found.</p>;
  const p = position(toTxns(h));
  const kinds = [
    ...(owner ? [["invest", "Invest"], ["exit", "Exit (sale)"]] : []),
    ["income", "Income (dividend, interest)"],
    ["valuation", "Valuation (mark)"],
  ];
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-white">{h.name}</h3>
        <p className="text-sm text-slate-400">
          {assetClassLabel(h.asset_class)} · {pillarLabel(h.pillar)} · held by {h.holder_name}
          {h.target_name ? ` · invested into ${h.target_name}` : ""} · <span className="capitalize">{h.status}</span>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Invested", rupees(p.invested)], ["Cost still held", rupees(p.costRemaining)],
          [`Current value${p.valuedOn ? ` (${p.valuedOn})` : " (at cost)"}`, rupees(p.currentValue)], ["MOIC", moic(p.moic)],
          ["Realised gain", rupees(p.realizedGain)], ["Income", rupees(p.income)], ["Unrealised gain", rupees(p.unrealizedGain)], ["Proceeds", rupees(p.proceeds)],
        ].map(([label, v]) => (
          <div key={label} className={`${card} p-4`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{v}</div>
          </div>
        ))}
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Date</th><th className={th}>Type</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>Cost recovered</th><th className={th}>Note</th></tr></thead>
          <tbody>
            {h.txns.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">No transactions yet.</td></tr> : h.txns.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className={td}>{t.date}</td><td className={`${td} capitalize`}>{t.kind}</td>
                <td className={num}>{rupees(decimalToPaise(t.amount))}</td>
                <td className={num}>{t.kind === "exit" ? rupees(decimalToPaise(t.cost_recovered)) : ""}</td>
                <td className={td}>{t.memo}{t.journal_entry_id ? " · posted" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {manage ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-1">Record a transaction</h3>
          <p className="text-xs text-slate-500 mb-4">
            {owner ? "Investing and exits post to the books at once." : "Investing and exits are recorded by the Super Admin."}
            {h.target_name ? ` An investment also posts as capital in ${h.target_name}'s books; add shares to update its cap table.` : ""}
          </p>
          <form action={addHoldingTxn} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="holdingId" value={h.id} />
            <select name="kind" defaultValue={kinds[0][0]} className={input} aria-label="Type">
              {kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input name="date" type="date" className={input} aria-label="Date" />
            <input name="amount" required inputMode="decimal" placeholder="Amount (or value) in ₹" className={input} />
            <input name="memo" maxLength={200} placeholder="Note" className={input} />
            {owner ? (
              <>
                <input name="costRecovered" inputMode="decimal" placeholder="Exit: cost recovered in ₹" className={input} />
                {h.target_name ? <input name="shares" inputMode="decimal" placeholder="Invest: shares received" className={input} /> : null}
                <label className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" name="markExited" /> Exit: fully exited</label>
              </>
            ) : null}
            <div className="md:col-span-4"><button className={btn}>Record</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function CapTables({ entities, selected, manage }: { entities: Awaited<ReturnType<typeof listEntities>>; selected?: string; manage: boolean }) {
  const companies = entities.filter((e) => e.kind === "spv" || e.kind === "venture" || e.kind === "other");
  const entity = companies.find((e) => e.id === selected) ?? companies[0];
  if (!entity) {
    return <p className="text-sm text-slate-500">No SPVs or ventures yet. Create one under Books, then its cap table lives here.</p>;
  }
  const rows = await listCapTable(entity.id);
  const table = capTable(rows.map((r) => ({ holder: r.holder_name, shares: Number(r.shares), invested: decimalToPaise(r.invested) })));
  return (
    <div className="space-y-6">
      <nav aria-label="Companies" className="flex flex-wrap gap-2">
        {companies.map((e) => (
          <Link key={e.id} href={`/portal/portfolio?view=cap&e=${e.id}`} className={`rounded-full border px-3 py-1 text-sm ${e.id === entity.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            {e.name}
          </Link>
        ))}
      </nav>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Holder</th><th className={`${th} text-right`}>Shares</th><th className={`${th} text-right`}>Ownership</th><th className={`${th} text-right`}>Invested</th></tr></thead>
          <tbody>
            {table.holders.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-sm text-slate-500">No shareholders recorded.</td></tr> : table.holders.map((h) => (
              <tr key={h.holder} className="border-t border-slate-800" data-holder={h.holder}>
                <td className={td}>{h.holder}</td><td className={num}>{h.shares.toLocaleString("en-IN")}</td>
                <td className={num}>{h.percent.toFixed(2)}%</td><td className={num}>{rupees(h.invested)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {rows.length > 0 ? (
        <details className="text-sm text-slate-400">
          <summary className="cursor-pointer">Issue history</summary>
          <ul className="mt-2 space-y-1">
            {rows.map((r) => <li key={r.id}>{r.issued_on} · {r.holder_name} · {Number(r.shares).toLocaleString("en-IN")} {instrumentLabel(r.instrument)}{r.notes ? ` · ${r.notes}` : ""}</li>)}
          </ul>
        </details>
      ) : null}
      {manage ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">Add to {entity.name}&apos;s cap table</h3>
          <form action={addCap} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="entityId" value={entity.id} />
            <input name="holderName" required maxLength={120} placeholder="Holder name" className={input} />
            <select name="instrument" defaultValue="equity" className={input} aria-label="Instrument">
              {INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
            <input name="shares" required inputMode="decimal" placeholder="Shares or units" className={input} />
            <input name="invested" inputMode="decimal" placeholder="Invested ₹ (0 for sweat)" className={input} />
            <input name="issuedOn" type="date" className={input} aria-label="Issued on" />
            <input name="notes" maxLength={200} placeholder="Notes" className={input} />
            <div className="md:col-span-3"><button className={btn}>Add shareholder</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function AccessLinks({ entities }: { entities: Awaited<ReturnType<typeof listEntities>> }) {
  const [scopes, users, ventures, holdings] = await Promise.all([listScopes(), externalUsers(), listVentures(null), listHoldings()]);
  const roleLabel = (r: string) => (isRole(r) ? ROLE_META[r].label : r);
  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-400 max-w-2xl">
        LPs, founders, operators and Co-Build partners see only what is linked here: an SPV or company (its cap table,
        summary books and holdings), a venture (its monthly statements) or a single holding. Operators also see ventures they operate.
      </p>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Person</th><th className={th}>Role</th><th className={th}>Sees</th><th className={th}></th></tr></thead>
          <tbody>
            {scopes.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-sm text-slate-500">No links yet.</td></tr> : scopes.map((sc) => (
              <tr key={sc.id} className="border-t border-slate-800" data-scope={`${sc.user_email} ${sc.ref_name}`}>
                <td className={td}>{sc.user_email}</td><td className={td}>{roleLabel(sc.user_role)}</td>
                <td className={td}>{SCOPE_LABEL[sc.scope_type]}: {sc.ref_name ?? "(removed)"}</td>
                <td className={td}>
                  <form action={dropAccess}><input type="hidden" name="scopeId" value={sc.id} /><button className="text-xs text-red-300 hover:text-red-200">Remove</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Link a person</h3>
        {users.length === 0 ? <p className="text-sm text-slate-500">Invite an LP, founder, operator or Co-Build partner under Access first.</p> : (
          <form action={addAccess} className="grid gap-3 md:grid-cols-3">
            <select name="userId" className={input} aria-label="Person">
              {users.map((u) => <option key={u.id} value={u.id}>{u.email} ({roleLabel(u.role)})</option>)}
            </select>
            <select name="item" className={input} aria-label="Item">
              <optgroup label="SPVs and companies">
                {entities.filter((e) => e.kind !== "boring_pe").map((e) => <option key={e.id} value={`entity:${e.id}`}>{e.name}</option>)}
              </optgroup>
              <optgroup label="Ventures">{ventures.map((v) => <option key={v.id} value={`venture:${v.id}`}>{v.name}</option>)}</optgroup>
              <optgroup label="Holdings">{holdings.map((h) => <option key={h.id} value={`holding:${h.id}`}>{h.name}</option>)}</optgroup>
            </select>
            <button className={btn}>Link</button>
          </form>
        )}
      </section>
    </div>
  );
}

async function MyPortfolio({ userId }: { userId: string }) {
  const view = await myView(userId);
  const nothing = view.entities.length === 0 && view.holdings.length === 0;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Portfolio</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">The companies and investments linked to you.</p>
      </div>
      {nothing ? <p className="text-sm text-slate-500">Nothing is linked to you yet. Boring PE links your SPVs and holdings here.</p> : null}
      {view.entities.map((e) => {
        const table = capTable(e.cap.map((r) => ({ holder: r.holder_name, shares: Number(r.shares), invested: decimalToPaise(r.invested) })));
        return (
          <section key={e.id} className={`${card} p-6 space-y-5`} data-entity={e.name}>
            <div>
              <h3 className="text-lg font-semibold text-white">{e.name}</h3>
              <p className="text-xs text-slate-500">{kindLabel(e.kind)} · figures for this financial year from {e.fyFrom}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {[["Income", e.income], ["Expenses", e.expense], [e.net >= 0n ? "Profit" : "Loss", e.net], ["Cash", e.cash]].map(([label, v]) => (
                <div key={label as string} className="rounded-lg border border-slate-800 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{label as string}</div>
                  <div className="mt-1 text-base font-semibold text-white">{rupees(v as bigint)}</div>
                </div>
              ))}
            </div>
            <table className="w-full">
              <thead><tr><th className={th}>Shareholder</th><th className={`${th} text-right`}>Shares</th><th className={`${th} text-right`}>Ownership</th></tr></thead>
              <tbody>
                {table.holders.length === 0 ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-slate-500">No shareholders recorded.</td></tr> : table.holders.map((h) => (
                  <tr key={h.holder} className="border-t border-slate-800" data-holder={h.holder}>
                    <td className={td}>{h.holder}</td><td className={num}>{h.shares.toLocaleString("en-IN")}</td><td className={num}>{h.percent.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {e.holdings.length ? <HoldingList holdings={e.holdings} /> : null}
          </section>
        );
      })}
      {view.holdings.length ? (
        <section className={`${card} p-6 space-y-3`}>
          <h3 className="text-lg font-semibold text-white">Holdings</h3>
          <HoldingList holdings={view.holdings} />
        </section>
      ) : null}
    </div>
  );
}

function HoldingList({ holdings }: { holdings: HoldingRow[] }) {
  return (
    <table className="w-full">
      <thead><tr><th className={th}>Holding</th><th className={th}>Class</th><th className={`${th} text-right`}>Invested</th><th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>Returned</th><th className={`${th} text-right`}>MOIC</th></tr></thead>
      <tbody>
        {holdings.map((h) => {
          const p = position(toTxns(h));
          return (
            <tr key={h.id} className="border-t border-slate-800" data-holding={h.name}>
              <td className={td}>{h.name}</td><td className={td}>{assetClassLabel(h.asset_class)}</td>
              <td className={num}>{rupees(p.invested)}</td><td className={num}>{rupees(p.currentValue)}</td>
              <td className={num}>{rupees(p.proceeds + p.income)}</td><td className={num}>{moic(p.moic)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
