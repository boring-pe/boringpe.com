import Link from "next/link";
import { Activity } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getSql } from "@/lib/db";

const AREAS: { id: string; label: string; match: RegExp }[] = [
  { id: "access", label: "Access & security", match: /^(invited|role_changed|status|sessions_revoked|password_|2fa_|workspaces_changed|access_|backup_)/ },
  { id: "money", label: "Money & books", match: /^(money_|journal_|invoice|payrun|payment_|bank_|contribution|depreciation|asset_|budget_|holding|operator_|venture_period)/ },
  { id: "people", label: "People & KYC", match: /^(employee_|leave_|kyc_)/ },
  { id: "files", label: "Files & passwords", match: /^(document_|folder_|secret_)/ },
  { id: "tools", label: "Tools & assistant", match: /^(integration_|api_key|webhook_|mail|meeting_|whatsapp_|assistant_|account_added)/ },
];

/** "money_out_awaiting_approval" → "Money out awaiting approval". */
const words = (a: string) => a.replace(/_/g, " ").replace(/\b2fa\b/, "two-step").replace(/^./, (c) => c.toUpperCase());

/** Everything that happened in the portal, newest first: who did what, filterable by person and area. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ who?: string; area?: string }> }) {
  await requireSection("activity");
  const sp = await searchParams;
  const sql = await getSql();
  const rows = await sql.query<{ id: string; actor_email: string | null; action: string; target_email: string | null; detail: string | null; at: string }>(
    `select id::text, actor_email, action, target_email, detail, to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as at
       from access_audit where ($1::text is null or actor_email = $1) order by created_at desc, id desc limit 400`,
    [sp.who || null],
  );
  const people = (await sql.query<{ actor_email: string }>("select distinct actor_email from access_audit where actor_email is not null order by 1")).map((r) => r.actor_email);
  const area = AREAS.find((a) => a.id === sp.area);
  const shown = area ? rows.filter((r) => area.match.test(r.action)) : rows;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`;
  const q = (next: { who?: string; area?: string }) => {
    const p = new URLSearchParams();
    const who = "who" in next ? next.who : sp.who;
    const ar = "area" in next ? next.area : sp.area;
    if (who) p.set("who", who);
    if (ar) p.set("area", ar);
    return `/portal/activity${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-400"><Activity className="h-4 w-4" />Activity</div>
        <h2 className="mt-2 text-2xl font-bold text-white">What happened</h2>
        <p className="mt-2 text-sm text-slate-400">Every sign-in change, posting, approval, file and tool action, with who did it. Times are India time.</p>
      </div>
      <nav aria-label="Area" className="flex flex-wrap gap-2">
        <Link href={q({ area: undefined })} className={chip(!area)}>Everything</Link>
        {AREAS.map((a) => <Link key={a.id} href={q({ area: a.id })} className={chip(area?.id === a.id)}>{a.label}</Link>)}
      </nav>
      <form action="/portal/activity" className="flex flex-wrap items-center gap-2 text-sm">
        {sp.area ? <input type="hidden" name="area" value={sp.area} /> : null}
        <select name="who" defaultValue={sp.who ?? ""} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white" aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-300 hover:text-white">Show</button>
      </form>
      <section className="rounded-xl border border-slate-800 bg-slate-900" data-activity>
        {shown.length === 0 ? <p className="p-6 text-sm text-slate-500">Nothing here.</p> : (
          <ol className="divide-y divide-slate-800">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm" data-event={r.action}>
                <span className="w-32 shrink-0 font-mono text-xs text-slate-500">{r.at}</span>
                <span className="text-white">{words(r.action)}</span>
                {r.detail ? <span className="text-slate-400">· {r.detail}</span> : null}
                {r.target_email ? <span className="text-slate-400">· {r.target_email}</span> : null}
                <span className="ml-auto text-xs text-slate-500">{r.actor_email ?? "System"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
