import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { listEntities } from "@/lib/books";
import { listDocuments } from "@/lib/documents";
import { listHoldings } from "@/lib/investments";
import { canSeeFirmData } from "@/lib/rbac";
import { DOC_CATEGORIES, MAX_DOC_BYTES, ALLOWED_EXTENSIONS, docCategoryLabel, fileSize, isDocCategory } from "@/lib/vault-fields";
import { listVentures } from "@/lib/ventures";
import { remove, upload } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  uploaded: { text: "Document added." },
  deleted: { text: "Document deleted." },
  "no-file": { text: "Choose a file.", bad: true },
  "too-big": { text: `Files can be up to ${MAX_DOC_BYTES / 1024 / 1024} MB.`, bad: true },
  type: { text: `Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}.`, bad: true },
  "needs-link": { text: "To share a document outside the team, link it to an SPV, venture or holding.", bad: true },
  invalid: { text: "That was not valid.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";

export default async function VaultPage({ searchParams }: { searchParams: Promise<{ notice?: string; c?: string }> }) {
  const user = await requireSection("vault");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const firm = canSeeFirmData(user.role);
  const all = await listDocuments(user.id, firm);
  const category = isDocCategory(sp.c) ? sp.c : null;
  const docs = category ? all.filter((d) => d.category === category) : all;
  const [entities, ventures, holdings] = firm ? await Promise.all([listEntities(), listVentures(null), listHoldings()]) : [[], [], []];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">BIDU Vault</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          {firm ? "Agreements, statements, filings and playbooks. A document is for the team only unless you share it with the people linked to its SPV, venture or holding."
            : "Documents Boring PE has shared with you."}
        </p>
      </div>
      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}

      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        {[{ id: "", label: "All" }, ...DOC_CATEGORIES].map((c) => (
          <Link key={c.id} href={c.id ? `/portal/vault?c=${c.id}` : "/portal/vault"}
            className={`rounded-full border px-3 py-1 text-sm ${(category ?? "") === c.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            {c.label}
          </Link>
        ))}
      </nav>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Document</th><th className={th}>Category</th><th className={th}>Belongs to</th>{firm ? <th className={th}>Shared</th> : null}<th className={th}>Size</th><th className={th}>Added</th><th className={th}></th></tr></thead>
          <tbody>
            {docs.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-sm text-slate-500">No documents.</td></tr> : docs.map((d) => (
              <tr key={d.id} className="border-t border-slate-800" data-doc={d.title}>
                <td className={td}><a href={`/portal/vault/file/${d.id}`} className="text-blue-300 hover:text-blue-200">{d.title}</a><div className="text-xs text-slate-500">{d.file_name}</div></td>
                <td className={td}>{docCategoryLabel(d.category)}</td><td className={td}>{d.linked_name ?? "Boring PE"}</td>
                {firm ? <td className={td}>{d.visibility === "linked" ? "With linked people" : "Team only"}</td> : null}
                <td className={td}>{fileSize(d.size)}</td><td className={td}>{d.created_at}{firm && d.uploaded_by_email ? ` · ${d.uploaded_by_email}` : ""}</td>
                <td className={td}>
                  {user.role === "super_admin" ? (
                    <form action={remove}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-red-300 hover:text-red-200">Delete</button></form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {firm ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-1">Add a document</h3>
          <p className="text-xs text-slate-500 mb-4">Up to {MAX_DOC_BYTES / 1024 / 1024} MB: {ALLOWED_EXTENSIONS.join(", ")}.</p>
          <form action={upload} className="grid gap-3 md:grid-cols-3">
            <input name="file" type="file" required accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")} className={`${input} md:col-span-3`} aria-label="File" />
            <input name="title" maxLength={200} placeholder="Title (defaults to the file name)" className={input} />
            <select name="category" defaultValue="legal" className={input} aria-label="Category">
              {DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select name="link" defaultValue="" className={input} aria-label="Belongs to">
              <option value="">Boring PE (general)</option>
              <optgroup label="Entities">{entities.map((e) => <option key={e.id} value={`entity:${e.id}`}>{e.name}</option>)}</optgroup>
              <optgroup label="Ventures">{ventures.map((v) => <option key={v.id} value={`venture:${v.id}`}>{v.name}</option>)}</optgroup>
              <optgroup label="Holdings">{holdings.map((h) => <option key={h.id} value={`holding:${h.id}`}>{h.name}</option>)}</optgroup>
            </select>
            <select name="visibility" defaultValue="firm" className={input} aria-label="Who can see it">
              <option value="firm">Boring PE team only</option>
              <option value="linked">Also people linked to it</option>
            </select>
            <div className="md:col-span-3"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Upload</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
