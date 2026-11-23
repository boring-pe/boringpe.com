import Link from "next/link";
import { ChevronRight, FileText, Folder, FolderPlus, HardDrive, Lock, Search, Upload } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { listEntities } from "@/lib/books";
import { listDocuments } from "@/lib/documents";
import { allFolders, folderPath, getFolder, listFolders } from "@/lib/drive";
import { listHoldings } from "@/lib/investments";
import { canSeeFirmData } from "@/lib/rbac";
import { DOC_CATEGORIES, MAX_DOC_BYTES, ALLOWED_EXTENSIONS, docCategoryLabel, fileSize, isDocCategory } from "@/lib/vault-fields";
import { listVentures } from "@/lib/ventures";
import { editFolder, move, newFolder, remove, upload } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  uploaded: { text: "File added." },
  deleted: { text: "File deleted." },
  moved: { text: "File moved." },
  "folder-made": { text: "Folder created." },
  "folder-renamed": { text: "Folder renamed." },
  "folder-deleted": { text: "Folder deleted." },
  "folder-exists": { text: "A folder with that name is already here.", bad: true },
  "folder-not-empty": { text: "Move or delete what is inside before deleting the folder.", bad: true },
  "no-file": { text: "Choose a file.", bad: true },
  "too-big": { text: `Files can be up to ${MAX_DOC_BYTES / 1024 / 1024} MB.`, bad: true },
  type: { text: `Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}.`, bad: true },
  "needs-link": { text: "To share a file outside the team, link it to an SPV, venture or holding.", bad: true },
  invalid: { text: "That was not valid.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const small = "rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white";

const SHARE: Record<string, string> = { firm: "Team", linked: "Team + linked people", private: "Only me" };

export default async function VaultPage({ searchParams }: { searchParams: Promise<{ notice?: string; c?: string; f?: string; q?: string }> }) {
  const user = await requireSection("vault");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const firm = canSeeFirmData(user.role);
  const all = await listDocuments(user.id, firm);
  const category = isDocCategory(sp.c) ? sp.c : null;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const folder = firm && sp.f ? await getFolder(sp.f) : null;
  const folderId = folder?.id ?? null;
  // Searching or filtering looks everywhere; otherwise the drive shows the folder you are in.
  const browsing = firm && !q && !category;
  const docs = all.filter((d) =>
    (!category || d.category === category) &&
    (!q || `${d.title} ${d.file_name} ${d.linked_name ?? ""}`.toLowerCase().includes(q)) &&
    (!browsing || d.folder_id === folderId));
  const [entities, ventures, holdings, folders, path, moveTargets] = firm
    ? await Promise.all([listEntities(), listVentures(null), listHoldings(), browsing ? listFolders(folderId) : Promise.resolve([]), folderPath(folderId), allFolders()])
    : [[], [], [], [], [], []];
  const here = (extra = "") => `/portal/vault?${folderId ? `f=${folderId}&` : ""}${extra}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-400"><HardDrive className="h-4 w-4" />Drive</div>
        <h2 className="mt-2 text-2xl font-bold text-white">BIDU Vault</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          {firm ? "Your private drive: folders for each workspace, files kept in the portal's own database. A file is for the team unless you keep it to yourself, or share it with the people linked to its SPV, venture or holding."
            : "Documents Boring PE has shared with you."}
        </p>
      </div>
      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Categories" className="flex flex-wrap gap-2">
          {[{ id: "", label: "All" }, ...DOC_CATEGORIES].map((c) => (
            <Link key={c.id} href={c.id ? `/portal/vault?c=${c.id}` : "/portal/vault"}
              className={`rounded-full border px-3 py-1 text-sm ${(category ?? "") === c.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
              {c.label}
            </Link>
          ))}
        </nav>
        <form action="/portal/vault" className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search files" aria-label="Search files" className={`${input} pl-8`} />
        </form>
      </div>

      {firm && browsing ? (
        <nav aria-label="Folder" className="flex flex-wrap items-center gap-1 text-sm" data-breadcrumb>
          <Link href="/portal/vault" className={folderId ? "text-blue-300 hover:text-blue-200" : "text-white"}>All files</Link>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              {i === path.length - 1 ? <span className="text-white">{p.name}</span> : <Link href={`/portal/vault?f=${p.id}`} className="text-blue-300 hover:text-blue-200">{p.name}</Link>}
            </span>
          ))}
        </nav>
      ) : null}

      {firm && browsing && folders.length ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Folders">
          {folders.map((f) => (
            <Link key={f.id} href={`/portal/vault?f=${f.id}`} className={`${card} flex items-center gap-3 p-4 transition-colors hover:border-slate-700`} data-folder={f.name}>
              <Folder className="h-6 w-6 shrink-0 text-amber-400" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{f.name}</span>
                <span className="text-xs text-slate-500">{f.files} file{f.files === 1 ? "" : "s"}{f.folders ? ` · ${f.folders} folder${f.folders === 1 ? "" : "s"}` : ""}</span>
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>File</th><th className={th}>Category</th><th className={th}>Belongs to</th>{firm ? <th className={th}>Who sees it</th> : null}<th className={th}>Size</th><th className={th}>Added</th>{firm ? <th className={th}></th> : null}</tr></thead>
          <tbody>
            {docs.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">{q || category ? "No files match." : folderId ? "This folder is empty. Upload a file below." : "No files yet."}</td></tr> : docs.map((d) => (
              <tr key={d.id} className="border-t border-slate-800 align-top" data-doc={d.title}>
                <td className={td}>
                  <a href={`/portal/vault/file/${d.id}`} className="inline-flex items-center gap-1.5 text-blue-300 hover:text-blue-200"><FileText className="h-4 w-4 shrink-0" />{d.title}</a>
                  <div className="text-xs text-slate-500">{d.file_name}</div>
                </td>
                <td className={td}>{docCategoryLabel(d.category)}</td><td className={td}>{d.linked_name ?? "General"}</td>
                {firm ? <td className={td}>{d.visibility === "private" ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{SHARE.private}</span> : SHARE[d.visibility]}</td> : null}
                <td className={td}>{fileSize(d.size)}</td><td className={td}>{d.created_at}{firm && d.uploaded_by_email ? ` · ${d.uploaded_by_email}` : ""}</td>
                {firm ? (
                  <td className={td}>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-400 hover:text-white">More</summary>
                      <form action={move} className="mt-2 flex gap-1.5">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="folderId" value={folderId ?? ""} />
                        <select name="to" defaultValue={d.folder_id ?? ""} className={small} aria-label="Move to">
                          <option value="">All files (top)</option>
                          {moveTargets.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                        <button className="text-blue-400 hover:text-blue-300">Move</button>
                      </form>
                      {user.role === "super_admin" || d.uploaded_by === user.id ? (
                        <form action={remove} className="mt-2">
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="folderId" value={folderId ?? ""} />
                          <button className="text-red-300 hover:text-red-200">Delete</button>
                        </form>
                      ) : null}
                    </details>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {firm ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className={`${card} p-6 lg:col-span-2`}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-1"><Upload className="h-4 w-4 text-slate-500" />Upload {folder ? `to ${folder.name}` : "a file"}</h3>
            <p className="text-xs text-slate-500 mb-4">Up to {MAX_DOC_BYTES / 1024 / 1024} MB: {ALLOWED_EXTENSIONS.join(", ")}.</p>
            <form action={upload} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="folderId" value={folderId ?? ""} />
              <input name="file" type="file" required accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")} className={`${input} md:col-span-2`} aria-label="File" />
              <input name="title" maxLength={200} placeholder="Title (defaults to the file name)" className={input} />
              <select name="category" defaultValue="legal" className={input} aria-label="Category">
                {DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select name="link" defaultValue="" className={input} aria-label="Belongs to">
                <option value="">General</option>
                <optgroup label="Entities">{entities.map((e) => <option key={e.id} value={`entity:${e.id}`}>{e.name}</option>)}</optgroup>
                <optgroup label="Ventures">{ventures.map((v) => <option key={v.id} value={`venture:${v.id}`}>{v.name}</option>)}</optgroup>
                <optgroup label="Holdings">{holdings.map((h) => <option key={h.id} value={`holding:${h.id}`}>{h.name}</option>)}</optgroup>
              </select>
              <select name="visibility" defaultValue="firm" className={input} aria-label="Who can see it">
                <option value="firm">The team</option>
                <option value="private">Only me</option>
                <option value="linked">The team and people linked to it</option>
              </select>
              <div className="md:col-span-2"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Upload</button></div>
            </form>
          </section>
          <section className={`${card} p-6 space-y-4`}>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><FolderPlus className="h-4 w-4 text-slate-500" />New folder{folder ? ` in ${folder.name}` : ""}</h3>
              <form action={newFolder} className="mt-3 flex gap-2">
                <input type="hidden" name="folderId" value={folderId ?? ""} />
                <input name="name" required maxLength={120} placeholder="Folder name" className={input} />
                <button className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:text-white">Create</button>
              </form>
            </div>
            {folder ? (
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-semibold text-white">This folder</h3>
                <form action={editFolder} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={folder.id} />
                  <input name="name" defaultValue={folder.name} maxLength={120} className={input} aria-label="Folder name" />
                  <button name="op" value="rename" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:text-white">Rename</button>
                </form>
                <form action={editFolder} className="mt-2">
                  <input type="hidden" name="id" value={folder.id} />
                  <button name="op" value="delete" className="text-xs text-red-300 hover:text-red-200">Delete this folder (only when empty)</button>
                </form>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
