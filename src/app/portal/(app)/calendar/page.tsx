import Link from "next/link";
import { agenda, linkTargets } from "@/lib/calendar";
import { requireSection } from "@/lib/dal";
import { canSeeFirmData } from "@/lib/rbac";
import { newMeeting } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  created: { text: "Meeting created and invitations sent." },
  failed: { text: "The calendar refused that meeting. Check the mailbox under Inbox → Accounts.", bad: true },
  invalid: { text: "Give a title, a start before the end, and attendee emails separated by commas.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const ist = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(new Date(iso));
const LINK_LABEL: Record<string, string> = { deal: "Deal", venture: "Venture", party: "Contact", employee: "Person" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireSection("calendar");
  const { notice } = await searchParams;
  const firm = canSeeFirmData(user.role);
  const [{ accounts, items, errors }, targets] = await Promise.all([agenda(user.id), firm ? linkTargets() : Promise.resolve([])]);
  const banner = notice ? NOTICES[notice] : undefined;
  const days = new Map<string, typeof items>();
  for (const e of items) {
    const key = ist(e.start, { weekday: "long", day: "numeric", month: "long" });
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  // The next whole hour in India time, as the form's default start.
  const now = ist(new Date().toISOString(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
    .replace(/^(\d{2})\/(\d{2})\/(\d{4}), (\d{2})$/, "$3-$2-$1T$4");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Calendar</h2>
        <p className="mt-2 text-sm text-slate-400">The next two weeks from your Google and Outlook calendars, in India time.</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}
      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500">Connect a Google or Microsoft mailbox under <Link href="/portal/inbox?view=accounts" className="text-blue-300">Inbox → Accounts</Link>; its calendar comes with it.</p>
      ) : (
        <>
          {errors.map((e) => <p key={e.email} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{e.email}: {e.message}</p>)}
          <section className="space-y-4" data-agenda>
            {items.length === 0 ? <p className="text-sm text-slate-500">Nothing in the next two weeks.</p> : [...days.entries()].map(([day, list]) => (
              <div key={day}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</h3>
                <ul className={`${card} divide-y divide-slate-800`}>
                  {list.map((e) => (
                    <li key={`${e.accountId}:${e.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3" data-event={e.title}>
                      <div className="min-w-0">
                        <div className="text-sm text-white">{e.title}</div>
                        <div className="text-xs text-slate-500">
                          {e.allDay ? "All day" : `${ist(e.start, { hour: "2-digit", minute: "2-digit" })} to ${ist(e.end, { hour: "2-digit", minute: "2-digit" })}`}
                          {e.location ? ` · ${e.location}` : ""} · {e.accountEmail}
                          {e.link ? <span className="ml-1 rounded bg-blue-500/15 px-1.5 text-blue-200">{LINK_LABEL[e.link.type]}: {e.link.name}</span> : null}
                        </div>
                      </div>
                      {e.joinUrl ? <a href={e.joinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400">Join ↗</a> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          <section className={`${card} p-5`}>
            <h3 className="mb-3 text-sm font-semibold text-white">New meeting</h3>
            <form action={newMeeting} className="grid gap-3 md:grid-cols-2">
              <select name="accountId" className={input} aria-label="Calendar">{accounts.map((a) => <option key={a.id} value={a.id}>In {a.email}</option>)}</select>
              <input name="title" required maxLength={200} placeholder="Title" className={input} />
              <label className="text-xs text-slate-500">Starts (India time)<input name="start" type="datetime-local" required defaultValue={`${now}:00`} className={`${input} mt-1`} /></label>
              <label className="text-xs text-slate-500">Ends<input name="end" type="datetime-local" required className={`${input} mt-1`} /></label>
              <input name="attendees" placeholder="Attendee emails, comma-separated" className={`${input} md:col-span-2`} />
              {firm ? (
                <select name="link" defaultValue="" className={input} aria-label="Link to">
                  <option value="">Not linked to a record</option>
                  {targets.map((t) => <option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>{LINK_LABEL[t.type]}: {t.name}</option>)}
                </select>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="online" defaultChecked /> Add a video link (Meet or Teams)</label>
              <textarea name="description" rows={3} placeholder="Agenda" className={`${input} md:col-span-2`} />
              <div className="md:col-span-2"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Create and invite</button></div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
