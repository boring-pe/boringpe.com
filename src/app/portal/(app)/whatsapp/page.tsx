import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { credentials } from "@/lib/integrations";
import { canSeeFirmData } from "@/lib/rbac";
import { listUsers } from "@/lib/users";
import { conversations, templates, thread } from "@/lib/whatsapp";
import { displayPhone, normalizePhone } from "@/lib/whatsapp-calc";
import { reply, setOwner, template } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  sent: { text: "Sent." },
  assigned: { text: "Conversation assigned." },
  window: { text: "It has been more than 24 hours since they wrote. WhatsApp only allows an approved template now.", bad: true },
  failed: { text: "WhatsApp did not accept it. The message shows why.", bad: true },
  params: { text: "Fill in every blank of the template.", bad: true },
  invalid: { text: "That was not valid. Use the full number with country code.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500";
const TICKS: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓ read", failed: "failed", received: "" };

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ c?: string; mine?: string; q?: string; notice?: string; start?: string }> }) {
  const user = await requireSection("whatsapp");
  const sp = await searchParams;
  const connected = Boolean((await credentials("whatsapp"))?.phoneNumberId);
  const [list, tpl, team] = await Promise.all([
    conversations({ mine: sp.mine ? user.id : undefined, q: sp.q?.replace(/[^\w\s+]/g, "").slice(0, 60) || undefined }),
    templates(),
    listUsers(),
  ]);
  const waId = sp.c ? normalizePhone(sp.c) : null;
  const t = waId ? await thread(waId) : null;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const firm = team.filter((u) => u.status === "active" && canSeeFirmData(u.role));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">WhatsApp</h2>
          <p className="mt-2 text-sm text-slate-400">The team&apos;s WhatsApp Business inbox. {connected ? "" : "Connect WhatsApp under Integrations to send and receive."}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/whatsapp?start=1" className={btn}>New conversation</Link>
          <a href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">Open WhatsApp Web ↗</a>
        </div>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className={`${card} ${waId || sp.start ? "hidden md:block" : ""} overflow-hidden`}>
          <form method="get" className="flex gap-2 border-b border-slate-800 p-3">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or number" className={input} />
            <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" name="mine" value="1" defaultChecked={Boolean(sp.mine)} />Mine</label>
          </form>
          <ul className="max-h-[70vh] divide-y divide-slate-800 overflow-y-auto">
            {list.length === 0 ? <li className="p-4 text-sm text-slate-500">No conversations yet.</li> : list.map((c) => (
              <li key={c.wa_id} data-chat={c.name ?? c.wa_id}>
                <Link href={`/portal/whatsapp?c=${c.wa_id}`} className={`block px-4 py-3 hover:bg-slate-800/60 ${c.wa_id === waId ? "bg-slate-800/60" : ""}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-semibold text-white" : "text-slate-300"}`}>{c.name ?? displayPhone(c.wa_id)}</span>
                    {c.unread ? <span className="rounded-full bg-green-600 px-2 text-xs text-white">{c.unread}</span> : null}
                  </div>
                  <div className="truncate text-xs text-slate-500">{c.preview ?? ""}</div>
                  {c.assignee_email ? <div className="text-[11px] text-slate-600">→ {c.assignee_email}</div> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${card} min-w-0 p-4`}>
          {sp.start ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Start a conversation</h3>
              <p className="text-xs text-slate-500">WhatsApp lets a business start with an approved template only. The person must have agreed to hear from you.</p>
              <TemplateForm templates={tpl} waId="" withPhone />
            </div>
          ) : !t?.contact ? (
            <p className="text-sm text-slate-500">Choose a conversation.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <Link href="/portal/whatsapp" className="mr-2 text-sm text-slate-400 md:hidden">←</Link>
                  <span className="font-semibold text-white">{t.contact.name ?? displayPhone(t.contact.wa_id)}</span>
                  <span className="ml-2 text-xs text-slate-500">{displayPhone(t.contact.wa_id)}</span>
                  <a href={`https://wa.me/${t.contact.wa_id}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-green-400">Open on phone ↗</a>
                </div>
                <form action={setOwner} className="flex items-center gap-2">
                  <input type="hidden" name="waId" value={t.contact.wa_id} />
                  <select name="userId" defaultValue={t.contact.assigned_to ?? ""} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" aria-label="Assigned to">
                    <option value="">Unassigned</option>
                    {firm.map((u) => <option key={u.id} value={u.id}>{u.email}{u.id === user.id ? " (me)" : ""}</option>)}
                  </select>
                  <button className="text-xs text-blue-300 hover:text-blue-200">Assign</button>
                </form>
              </div>
              <ol className="max-h-[55vh] space-y-2 overflow-y-auto" data-thread>
                {t.messages.map((m) => (
                  <li key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`} data-message={m.body}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? "bg-green-900/60 text-green-50" : "bg-slate-800 text-slate-100"}`}>
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className="mt-1 text-right text-[11px] text-slate-400">
                        {m.created_at}{m.direction === "out" ? ` · ${m.sender ?? ""} ${TICKS[m.status] ?? m.status}` : ""}
                        {m.error ? <span className="block text-red-300">{m.error}</span> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {t.canReply ? (
                <form action={reply} className="flex gap-2">
                  <input type="hidden" name="waId" value={t.contact.wa_id} />
                  <textarea name="text" required rows={2} maxLength={4096} placeholder="Type a message" className={input} />
                  <button className={btn}>Send</button>
                </form>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-300">More than 24 hours since they last wrote. Reopen with an approved template.</p>
                  <TemplateForm templates={tpl} waId={t.contact.wa_id} />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TemplateForm({ templates: tpl, waId, withPhone }: { templates: Awaited<ReturnType<typeof templates>>; waId: string; withPhone?: boolean }) {
  if (tpl.length === 0) return <p className="text-sm text-slate-500">No approved templates found. Create one in WhatsApp Manager.</p>;
  const most = Math.max(...tpl.map((x) => x.params));
  return (
    <form action={template} className="space-y-2">
      {withPhone ? (
        <div className="grid gap-2 md:grid-cols-2">
          <input name="waId" required placeholder="Number with country code, e.g. +91 98765 43210" className={input} />
          <input name="name" placeholder="Their name (optional)" className={input} />
        </div>
      ) : <input type="hidden" name="waId" value={waId} />}
      <select name="template" className={input} aria-label="Template">
        {tpl.map((x) => <option key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>{x.name} ({x.language}): {x.body.slice(0, 60)}</option>)}
      </select>
      {Array.from({ length: most }, (_, i) => <input key={i} name={`p${i + 1}`} placeholder={`Blank {{${i + 1}}} (if the template has it)`} className={input} />)}
      <button className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500">Send template</button>
    </form>
  );
}
