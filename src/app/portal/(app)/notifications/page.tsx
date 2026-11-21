import { requireUser } from "@/lib/dal";
import { emailConfigured, emailPreference, listNotifications } from "@/lib/notify";
import { emailPref, readAll } from "./actions";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const [rows, email] = await Promise.all([listNotifications(user.id), emailPreference(user.id)]);
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Notifications</h2>
          <p className="mt-2 text-sm text-slate-400">{unread ? `${unread} unread` : "All caught up."}</p>
        </div>
        {unread ? <form action={readAll}><button className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white">Mark all read</button></form> : null}
      </div>
      {saved ? <p role="status" className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">Saved.</p> : null}
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900">
        {rows.length === 0 ? <li className="px-4 py-6 text-sm text-slate-500">Nothing yet.</li> : rows.map((n) => (
          <li key={n.id} data-notification={n.title}>
            <a href={`/portal/notifications/open?id=${n.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-slate-800/60">
              <span className={`text-sm ${n.read_at ? "text-slate-400" : "font-semibold text-white"}`}>{n.read_at ? "" : "● "}{n.title}</span>
              {n.body ? <span className="text-sm text-slate-400">{n.body}</span> : null}
              <span className="text-xs text-slate-600">{n.created_at}</span>
            </a>
          </li>
        ))}
      </ul>
      <form action={emailPref} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300 flex flex-wrap items-center gap-3">
        <span>Email me these too: <strong className="text-white">{email ? "on" : "off"}</strong>{emailConfigured() ? "" : " (email sending is not set up yet; only portal notifications are sent)"}</span>
        <input type="hidden" name="on" value={email ? "false" : "true"} />
        <button className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:text-white">{email ? "Turn email off" : "Turn email on"}</button>
      </form>
    </div>
  );
}
