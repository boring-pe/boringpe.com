import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { ACCOUNT_TYPES, ENTITY_KINDS, balanceSheet, entityKindLabel, profitAndLoss, rupees, trialBalance } from "@/lib/accounting";
import { balances, decimalToPaise, listAccounts, listEntities, listJournal } from "@/lib/books";
import { canPostBooks } from "@/lib/rbac";
import { addAccount, addEntity, postJournal, reverseJournal } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  posted: { text: "Entry posted." },
  reversed: { text: "Entry reversed with a mirror entry." },
  "account-added": { text: "Account added." },
  "entity-added": { text: "Entity created with the standard chart of accounts." },
  invalid: { text: "That was not valid.", bad: true },
  details: { text: "Add a date, a description of at least three characters, and active accounts of this entity.", bad: true },
  unbalanced: { text: "The entry is not valid or debits and credits are not equal.", bad: true },
  failed: { text: "The books refused that entry.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
  "cannot-reverse": { text: "That entry cannot be reversed (already reversed, or itself a reversal).", bad: true },
  "code-taken": { text: "That account code is already used in this entity.", bad: true },
  "entity-exists": { text: "An entity with that name already exists.", bad: true },
};
const VIEWS = [
  ["overview", "Trial balance"],
  ["journal", "Journal"],
  ["accounts", "Accounts"],
  ["reports", "Reports"],
] as const;
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";

const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
/** Indian financial year: April to March. */
function fiscalYear(today = new Date()) {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; view?: string; notice?: string; from?: string; to?: string }>;
}) {
  const user = await requireSection("books");
  const sp = await searchParams;
  const entities = await listEntities();
  const entity = entities.find((x) => x.id === sp.e) ?? entities[0];
  const view = VIEWS.some(([id]) => id === sp.view) ? (sp.view as string) : "overview";
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const mayPost = canPostBooks(user.role);
  const owner = user.role === "super_admin";
  const today = new Date().toISOString().slice(0, 10);
  const fy = fiscalYear();
  const from = isDate(sp.from) ?? fy.from;
  const to = isDate(sp.to) ?? fy.to;
  const href = (v: string, extra = "") => `/portal/books?e=${entity.id}&view=${v}${extra}`;

  const accounts = await listAccounts(entity.id);
  const active = accounts.filter((a) => a.active);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Books</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Double-entry books for each entity. Posted entries are never edited or deleted; a mistake is corrected by a reversing entry.
        </p>
      </div>

      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
          {banner.text}
        </p>
      ) : null}

      <nav aria-label="Entities" className="flex flex-wrap gap-2">
        {entities.map((x) => (
          <Link
            key={x.id}
            href={`/portal/books?e=${x.id}&view=${view}`}
            className={`rounded-full border px-3 py-1 text-sm ${x.id === entity.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}
          >
            {x.name}
            <span className="ml-2 text-xs text-slate-500">{entityKindLabel(x.kind)}</span>
          </Link>
        ))}
      </nav>

      <nav aria-label="Books sections" className="flex gap-1 border-b border-slate-800">
        {VIEWS.map(([id, label]) => (
          <Link
            key={id}
            href={href(id)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${view === id ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "overview" ? <Overview entityId={entity.id} /> : null}
      {view === "journal" ? <Journal entityId={entity.id} entityName={entity.name} active={active} mayPost={mayPost} owner={owner} today={today} /> : null}
      {view === "accounts" ? <Accounts accounts={accounts} entityId={entity.id} mayPost={mayPost} /> : null}
      {view === "reports" ? <Reports entityId={entity.id} from={from} to={to} /> : null}

      {owner && view === "overview" ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-1">Add an entity</h3>
          <p className="text-xs text-slate-500 mb-4">An SPV, a venture or a fund. It gets its own books and the standard chart of accounts.</p>
          <form action={addEntity} className="grid gap-3 md:grid-cols-4">
            <input name="name" required maxLength={80} placeholder="Name" className={input} />
            <select name="kind" defaultValue="spv" className={input} aria-label="Kind">
              {ENTITY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <input name="legalForm" maxLength={80} placeholder="Legal form (LLP, Pvt Ltd, trust…)" className={input} />
            <select name="parentId" defaultValue="" className={input} aria-label="Parent entity">
              <option value="">No parent</option>
              {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <div className="md:col-span-4"><button className={btn}>Create entity</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function Overview({ entityId }: { entityId: string }) {
  const tb = trialBalance(await balances(entityId, null, null));
  return (
    <section className={`${card} overflow-x-auto`}>
      <table className="w-full">
        <thead><tr><th className={th}>Code</th><th className={th}>Account</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th></tr></thead>
        <tbody>
          {tb.lines.length === 0 ? (
            <tr><td colSpan={4} className="px-3 py-6 text-sm text-slate-500">No entries yet. Post the first one in Journal.</td></tr>
          ) : tb.lines.map((l) => (
            <tr key={l.id} className="border-t border-slate-800">
              <td className={td}>{l.code}</td><td className={td}>{l.name}</td>
              <td className={num}>{l.debit ? rupees(l.debit) : ""}</td><td className={num}>{l.credit ? rupees(l.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-700">
            <td className={td} colSpan={2}>Total {tb.balanced ? "(balanced)" : "(OUT OF BALANCE)"}</td>
            <td className={`${num} font-semibold`}>{rupees(tb.debit)}</td><td className={`${num} font-semibold`}>{rupees(tb.credit)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

async function Journal({ entityId, entityName, active, mayPost, owner, today }: {
  entityId: string; entityName: string; active: Awaited<ReturnType<typeof listAccounts>>; mayPost: boolean; owner: boolean; today: string;
}) {
  const entries = await listJournal(entityId);
  return (
    <div className="space-y-8">
      {mayPost ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">Post an entry · {entityName}</h3>
          <form action={postJournal} className="space-y-3">
            <input type="hidden" name="entityId" value={entityId} />
            <div className="grid gap-3 md:grid-cols-4">
              <input name="date" type="date" required defaultValue={today} className={input} aria-label="Date" />
              <input name="memo" required maxLength={300} placeholder="Description" className={`${input} md:col-span-3`} />
            </div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid gap-3 md:grid-cols-4">
                <select name={`account${i}`} defaultValue="" className={`${input} md:col-span-2`} aria-label={`Account ${i + 1}`}>
                  <option value="">Account…</option>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
                <input name={`debit${i}`} inputMode="decimal" placeholder="Debit" className={input} aria-label={`Debit ${i + 1}`} />
                <input name={`credit${i}`} inputMode="decimal" placeholder="Credit" className={input} aria-label={`Credit ${i + 1}`} />
              </div>
            ))}
            <button className={btn}>Post entry</button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        {entries.length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : null}
        {entries.map((e) => (
          <article key={e.id} className={`${card} p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm text-white">{e.entry_date} · {e.memo}</div>
              <div className="text-xs text-slate-500">
                {e.reversal_of ? "Reversal · " : ""}{e.reversed_by ? "Reversed · " : ""}{e.created_by_email ?? "system"}
              </div>
            </div>
            <table className="mt-2 w-full">
              <tbody>
                {e.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-0.5 text-sm text-slate-300">{l.account}</td>
                    <td className="py-0.5 text-sm text-right tabular-nums text-slate-200">{Number(l.debit) > 0 ? rupees(decimalToPaise(l.debit)) : ""}</td>
                    <td className="py-0.5 text-sm text-right tabular-nums text-slate-200">{Number(l.credit) > 0 ? rupees(decimalToPaise(l.credit)) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {owner && !e.reversed_by && !e.reversal_of ? (
              <form action={reverseJournal} className="mt-3">
                <input type="hidden" name="entityId" value={entityId} />
                <input type="hidden" name="entryId" value={e.id} />
                <button className="text-xs text-red-300 hover:text-red-200">Reverse this entry</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function Accounts({ accounts, entityId, mayPost }: { accounts: Awaited<ReturnType<typeof listAccounts>>; entityId: string; mayPost: boolean }) {
  return (
    <div className="space-y-8">
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Code</th><th className={th}>Name</th><th className={th}>Type</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className={td}>{a.code}</td><td className={td}>{a.name}</td><td className={`${td} capitalize`}>{a.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {mayPost ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">Add an account</h3>
          <form action={addAccount} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="entityId" value={entityId} />
            <input name="code" required pattern="[0-9]{3,6}" placeholder="Code, e.g. 5110" className={input} />
            <input name="name" required maxLength={80} placeholder="Name" className={input} />
            <select name="type" defaultValue="expense" className={input} aria-label="Type">
              {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button className={btn}>Add account</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function Reports({ entityId, from, to }: { entityId: string; from: string; to: string }) {
  const [period, upTo] = await Promise.all([balances(entityId, from, to), balances(entityId, null, to)]);
  const pl = profitAndLoss(period);
  const bs = balanceSheet(upTo);
  const block = (title: string, lines: { id: string; code: string; name: string; amount: bigint }[], total: bigint) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mt-4">{title}</div>
      {lines.map((l) => (
        <div key={l.id} className="flex justify-between py-1 text-sm text-slate-300"><span>{l.code} {l.name}</span><span className="tabular-nums">{rupees(l.amount)}</span></div>
      ))}
      <div className="flex justify-between border-t border-slate-800 py-1 text-sm font-semibold text-white"><span>Total {title.toLowerCase()}</span><span className="tabular-nums">{rupees(total)}</span></div>
    </div>
  );
  return (
    <div className="space-y-8">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="e" value={entityId} />
        <input type="hidden" name="view" value="reports" />
        <label className="text-xs text-slate-500">From<input name="from" type="date" defaultValue={from} className={`${input} mt-1`} /></label>
        <label className="text-xs text-slate-500">To<input name="to" type="date" defaultValue={to} className={`${input} mt-1`} /></label>
        <button className={btn}>Update</button>
      </form>
      <div className="grid gap-6 md:grid-cols-2">
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white">Profit and loss · {from} to {to}</h3>
          {block("Income", pl.income.lines, pl.income.total)}
          {block("Expenses", pl.expense.lines, pl.expense.total)}
          <div className="mt-4 flex justify-between text-base font-semibold text-white"><span>Net {pl.net >= 0n ? "profit" : "loss"}</span><span className="tabular-nums">{rupees(pl.net)}</span></div>
        </section>
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white">Balance sheet · as of {to}</h3>
          {block("Assets", bs.assets.lines, bs.assets.total)}
          {block("Liabilities", bs.liabilities.lines, bs.liabilities.total)}
          {block("Equity", bs.equity.lines, bs.equity.total)}
          <div className="flex justify-between py-1 text-sm text-slate-300"><span>Retained earnings to date</span><span className="tabular-nums">{rupees(bs.earnings)}</span></div>
          <div className="mt-2 text-xs text-slate-500">{bs.balanced ? "Assets equal liabilities plus equity." : "Out of balance."}</div>
        </section>
      </div>
    </div>
  );
}
