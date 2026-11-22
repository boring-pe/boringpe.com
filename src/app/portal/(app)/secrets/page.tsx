import { KeySquare, Lock, Users } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { ROLES, ROLE_META } from "@/lib/rbac";
import { listSecrets } from "@/lib/secrets";
import { workspaceLabel } from "@/lib/workspace-calc";
import { addSecret, changeSecret, removeSecret, reveal } from "./actions";
import { Reveal } from "./reveal";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  added: { text: "Saved and sealed." },
  changed: { text: "Secret changed." },
  deleted: { text: "Deleted." },
  invalid: { text: "Give it a name and a secret.", bad: true },
  url: { text: "The address must start with https:// or http://.", bad: true },
  forbidden: { text: "Only the owner, or the Super Admin for shared entries, can change that.", bad: true },
};

export default async function SecretsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireSection("secrets");
  const { notice } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const secrets = await listSecrets(user);
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-400"><KeySquare className="h-4 w-4" />Private infrastructure</div>
        <h2 className="mt-2 text-2xl font-bold text-white">Password vault</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Logins for banks, portals, registrars and tools, sealed with AES-256 in the portal&apos;s own database. Private entries are yours alone; shared ones open to the roles you choose in this workspace. Every look is logged.</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}

      <section className={`${card} overflow-x-auto`} data-secrets>
        {secrets.length === 0 ? <p className="p-6 text-sm text-slate-500">Nothing saved here yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Username</th><th className="px-4 py-3 font-medium">Secret</th><th className="px-4 py-3 font-medium">Who sees it</th><th className="px-4 py-3 font-medium" /></tr></thead>
            <tbody>
              {secrets.map((s) => {
                const mine = s.owner_id === user.id || user.role === "super_admin";
                return (
                  <tr key={s.id} className="border-t border-slate-800 align-top" data-secret={s.title}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">{s.title}</a> : s.title}</div>
                      <div className="text-xs text-slate-500">{workspaceLabel(s.workspace)} · {s.owner_email}{s.last_seen ? ` · last opened ${s.last_seen.slice(0, 10)}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{s.username || "—"}</td>
                    <td className="px-4 py-3"><Reveal id={s.id} action={reveal} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {s.share === "private" ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Only the owner</span> : <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{s.roles.map((r) => ROLE_META[r as keyof typeof ROLE_META]?.label ?? r).join(", ")}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {mine && (s.owner_id === user.id || s.share === "roles") ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-400 hover:text-white">Change</summary>
                          <form action={changeSecret} className="mt-2 flex gap-2">
                            <input type="hidden" name="id" value={s.id} />
                            <input name="secret" type="password" required placeholder="New secret" autoComplete="new-password" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
                            <button className="text-blue-400 hover:text-blue-300">Save</button>
                          </form>
                          <form action={removeSecret} className="mt-2"><input type="hidden" name="id" value={s.id} /><button className="text-red-400 hover:text-red-300">Delete</button></form>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white">Add a login or secret</h3>
        <form action={addSecret} className="mt-4 grid gap-3 md:grid-cols-2" autoComplete="off">
          <input name="title" required maxLength={120} placeholder="Name, e.g. HDFC NetBanking" className={input} />
          <input name="url" maxLength={300} placeholder="https://…" className={input} />
          <input name="username" maxLength={200} placeholder="Username or customer ID" className={input} autoComplete="off" />
          <input name="secret" type="password" required maxLength={4000} placeholder="Password, PIN or key" className={input} autoComplete="new-password" />
          <textarea name="notes" maxLength={4000} rows={2} placeholder="Notes (sealed too): security answers, recovery steps" className={`${input} md:col-span-2`} />
          <fieldset className="md:col-span-2 flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="radio" name="share" value="private" defaultChecked />Only me</label>
            <label className="flex items-center gap-2"><input type="radio" name="share" value="roles" />Share with:</label>
            {ROLES.filter((r) => ["super_admin", "admin", "partner", "operator"].includes(r)).map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="roles" value={r} />{ROLE_META[r].label}</label>
            ))}
          </fieldset>
          <div className="md:col-span-2"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Save</button></div>
        </form>
      </section>
    </div>
  );
}
