import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { candidatesFor, listBankLines, reconciliation } from "@/lib/bank";
import { decimalToPaise, listAccounts, listEntities } from "@/lib/books";
import { canPostBooks } from "@/lib/rbac";
import { lineAction, upload } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  imported: { text: "Statement imported." },
  rematched: { text: "Matching run." },
  "done-match": { text: "Matched." },
  "done-post": { text: "Posted to the books and matched." },
  "done-ignore": { text: "Ignored." },
  "done-restore": { text: "Back to unmatched." },
  "done-unmatch": { text: "Unmatched." },
  "no-file": { text: "Choose a CSV file.", bad: true },
  csv: { text: "Upload the statement as a CSV file of up to 2 MB (most banks offer CSV or Excel → Save as CSV).", bad: true },
  unreadable: { text: "Could not find the date and amount columns in that file.", bad: true },
  invalid: { text: "That could not be done.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300 align-top";
const STATUS: Record<string, string> = { unmatched: "text-amber-400", matched: "text-green-400", posted: "text-green-400", ignored: "text-slate-500" };
const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; notice?: string; added?: string; dup?: string; skip?: string; matched?: string }>;
}) {
  const user = await requireSection("bank");
  const sp = await searchParams;
  const entities = await listEntities();
  const entity = entities.find((x) => x.id === sp.e) ?? entities[0];
  const post = canPostBooks(user.role);
  const [lines, recon, candidates, accounts] = await Promise.all([
    listBankLines(entity.id), reconciliation(entity.id), candidatesFor(entity.id), listAccounts(entity.id),
  ]);
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const detail = sp.notice === "imported"
    ? ` ${sp.added ?? 0} new lines, ${sp.dup ?? 0} already imported, ${sp.skip ?? 0} rows skipped, ${sp.matched ?? 0} matched automatically.`
    : sp.notice === "rematched" ? ` ${sp.matched ?? 0} matched.` : "";
  const counters = accounts.filter((a) => a.active && a.code !== "1010");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Bank reconciliation</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Import a bank statement as CSV. Lines that match an entry in the books (same amount, within a week) are paired automatically; post the rest, such as bank charges or interest, in one click.
        </p>
      </div>
      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}{detail}</p>
      ) : null}
      <nav aria-label="Entities" className="flex flex-wrap gap-2">
        {entities.map((x) => (
          <Link key={x.id} href={`/portal/bank?e=${x.id}`} className={`rounded-full border px-3 py-1 text-sm ${x.id === entity.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>{x.name}</Link>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-4" data-recon>
        {[
          [`Bank balance (${recon.asOf})`, recon.bank === null ? "No balance in statement" : rupees(recon.bank)],
          [`Books balance (${recon.asOf})`, rupees(recon.book)],
          ["Difference", recon.difference === null ? "–" : rupees(recon.difference)],
          ["To review", `${recon.unmatched} unmatched`],
        ].map(([label, v]) => (
          <div key={label} className={`${card} p-5`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{v}</div>
          </div>
        ))}
      </div>

      {post ? (
        <section className={`${card} p-6 flex flex-wrap items-end gap-3`}>
          <form action={upload} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="entityId" value={entity.id} />
            <input name="file" type="file" accept=".csv" required className="text-sm text-slate-300" aria-label="Statement CSV" />
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Import statement</button>
          </form>
          <form action={lineAction}>
            <input type="hidden" name="entityId" value={entity.id} />
            <button name="what" value="rematch" className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white">Run matching again</button>
          </form>
        </section>
      ) : null}

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Date</th><th className={th}>Statement line</th><th className={`${th} text-right`}>Amount</th><th className={th}>Status</th><th className={th}>Action</th></tr></thead>
          <tbody>
            {lines.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">No statement lines yet.</td></tr> : lines.map((l) => {
              const amt = decimalToPaise(l.amount);
              const options = candidates.filter((c) => c.paise === amt && days(c.date, l.txn_date) <= 45);
              return (
                <tr key={l.id} className="border-t border-slate-800" data-bank-line={l.description}>
                  <td className={td}>{l.txn_date}</td>
                  <td className={td}>{l.description}{l.ref ? <div className="text-xs text-slate-500">{l.ref}</div> : null}</td>
                  <td className={`${td} text-right tabular-nums ${amt > 0n ? "text-green-400" : "text-slate-200"}`}>{amt > 0n ? "+" : "−"}{rupees(amt < 0n ? -amt : amt)}</td>
                  <td className={`${td} capitalize ${STATUS[l.status]}`}>
                    {l.status}{l.matched_memo ? <div className="text-xs normal-case text-slate-500">{l.matched_date} · {l.matched_memo}</div> : null}
                  </td>
                  <td className={td}>
                    {post && l.status === "unmatched" ? (
                      <div className="space-y-2">
                        {options.length ? (
                          <form action={lineAction} className="flex flex-wrap gap-2">
                            <input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="lineId" value={l.id} />
                            <select name="journalLineId" className={input} aria-label="Book entry">{options.map((o) => <option key={o.id} value={o.id}>{o.date} · {o.memo}</option>)}</select>
                            <button name="what" value="match" className="text-xs text-blue-300 hover:text-blue-200">Match</button>
                          </form>
                        ) : null}
                        <form action={lineAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="lineId" value={l.id} />
                          <select name="counterCode" defaultValue={amt < 0n ? "5070" : "4900"} className={input} aria-label="Account">
                            {counters.map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}</option>)}
                          </select>
                          <button name="what" value="post" className="text-xs text-blue-300 hover:text-blue-200">Post</button>
                          <button name="what" value="ignore" className="text-xs text-slate-400 hover:text-white">Ignore</button>
                        </form>
                      </div>
                    ) : post && l.status === "matched" ? (
                      <form action={lineAction}><input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="lineId" value={l.id} /><button name="what" value="unmatch" className="text-xs text-slate-400 hover:text-white">Unmatch</button></form>
                    ) : post && l.status === "ignored" ? (
                      <form action={lineAction}><input type="hidden" name="entityId" value={entity.id} /><input type="hidden" name="lineId" value={l.id} /><button name="what" value="restore" className="text-xs text-slate-400 hover:text-white">Restore</button></form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
