import Link from "next/link";
import { Check, CircleSlash, Plus, Settings2, Trash2, Wrench, X } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { aiProviderName, AI_PROVIDERS, type Block } from "@/lib/ai-format";
import { readyProviders } from "@/lib/ai";
import {
  getThread, listThreads, policyFor, recentActions, rolePolicy, threadActions, threadMessages, type ActionRow,
} from "@/lib/assistant";
import { CATEGORIES, CEILING, MODES, MODE_LABEL, defaultMode, type Mode } from "@/lib/assistant-policy";
import { toolByName } from "@/lib/assistant-tools";
import { listIntegrations } from "@/lib/integrations";
import { ROLES, ROLE_META, isRole } from "@/lib/rbac";
import type { UserRow } from "@/lib/users";
import { decideAction, removeThread, saveAssistantSettings, saveMyPolicy, saveRolePolicy, sendMessage } from "./actions";
import { Composer } from "./composer";
import { ConfirmButton } from "../_shell/buttons";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const input = "rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  done: { text: "Approved and done." },
  rejected: { text: "Declined. Nothing was done." },
  failed: { text: "Approved, but it did not go through. The reason is in the conversation.", bad: true },
  "not-allowed": { text: "That is no longer allowed for you, so it was not done.", bad: true },
  gone: { text: "That request was already decided.", bad: true },
  saved: { text: "Saved." },
  invalid: { text: "That was not valid.", bad: true },
  "ai-failed": { text: "No AI service answered. Check Integrations → AI assistant.", bad: true },
};

function Avatar({ name, size = "h-8 w-8 text-sm" }: { name: string; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-400 font-semibold text-white ${size}`} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const STATUS: Record<ActionRow["status"], { label: string; tone: string }> = {
  proposed: { label: "Waiting for your yes", tone: "text-amber-400" },
  done: { label: "Done", tone: "text-green-400" },
  failed: { label: "Did not go through", tone: "text-red-400" },
  rejected: { label: "Declined", tone: "text-slate-500" },
};

function ActionCard({ a, threadId }: { a: ActionRow; threadId: string }) {
  const tool = toolByName(a.tool);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-3" data-action={a.status}>
      <div className="flex items-start gap-2">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white">{tool?.describe(a.input) ?? a.tool}</div>
          <div className={`mt-0.5 text-xs ${STATUS[a.status].tone}`}>{STATUS[a.status].label}{a.auto ? " · on her own" : ""}{a.result && a.status !== "proposed" ? ` · ${a.result}` : ""}</div>
        </div>
      </div>
      {a.status === "proposed" ? (
        <div className="mt-3 flex gap-2">
          <form action={decideAction}>
            <input type="hidden" name="actionId" value={a.id} />
            <input type="hidden" name="threadId" value={threadId} />
            <input type="hidden" name="decision" value="approve" />
            <button className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"><Check className="h-3.5 w-3.5" />Approve</button>
          </form>
          <form action={decideAction}>
            <input type="hidden" name="actionId" value={a.id} />
            <input type="hidden" name="threadId" value={threadId} />
            <input type="hidden" name="decision" value="decline" />
            <button className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"><X className="h-3.5 w-3.5" />Decline</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ t?: string; view?: string; notice?: string; role?: string }> }) {
  const user = await requireSection("assistant");
  const sp = await searchParams;
  const policy = await policyFor(user);
  const name = policy.settings.name;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="h-11 w-11 text-lg" />
        <div>
          <h2 className="text-2xl font-bold text-white" data-assistant-name>{name}</h2>
          <p className="text-sm text-slate-400">Your assistant for work and personal things. She works inside your role and the workspace you are in.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/portal/assistant" className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white"><Plus className="h-4 w-4" />New</Link>
        <Link href="/portal/assistant?view=settings" className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white"><Settings2 className="h-4 w-4" />What she may do</Link>
      </div>
    </div>
  );
  const notice = banner ? (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
  ) : null;

  if (sp.view === "settings") return <div className="space-y-6">{header}{notice}<SettingsView user={user} policy={policy} roleParam={sp.role} /></div>;

  const [threads, ready] = await Promise.all([listThreads(user.id), readyProviders()]);
  const thread = sp.t ? await getThread(sp.t, user.id) : null;
  const [messages, actions] = thread ? await Promise.all([threadMessages(thread.id), threadActions(thread.id)]) : [[], []];
  const byUse = new Map(actions.map((a) => [a.tool_use_id, a]));

  const suggestions = thread ? [] : [
    "How are we doing this month?",
    "What needs my attention today?",
    "Which invoices are overdue?",
    "Add a task: review the Q3 MIS by Friday",
    "Draft a polite payment reminder email",
  ];

  return (
    <div className="space-y-6">
      {header}
      {notice}
      {ready.length === 0 ? (
        <p className={`${card} p-4 text-sm text-slate-300`}>
          No AI service is set up yet. {user.role === "super_admin" ? <Link className="text-blue-400 hover:text-blue-300" href="/portal/integrations">Add one under Integrations → AI assistant</Link> : "Ask the Super Admin to add one under Integrations."}: Claude, OpenAI, Gemini or your own server.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className={`${card} h-fit p-2`} aria-label="Conversations">
          <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Conversations</div>
          {threads.length === 0 ? <p className="px-2 py-2 text-sm text-slate-500">None yet.</p> : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link href={`/portal/assistant?t=${t.id}`} className={`block truncate rounded-md px-2 py-1.5 text-sm ${t.id === thread?.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"}`}>{t.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={`${card} flex min-h-[60vh] flex-col`}>
          <div className="flex-1 space-y-5 p-4 sm:p-6" data-messages>
            {!thread ? (
              <div className="py-10 text-center">
                <Avatar name={name} size="mx-auto h-14 w-14 text-2xl" />
                <h3 className="mt-4 text-lg font-semibold text-white">Hello{user.name ? `, ${user.name.split(" ")[0]}` : ""}. How can I help?</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">I can look up figures, insights, invoices, tasks, mail and your calendar, and act for you within what you allow: tasks, notes, email, meetings, WhatsApp replies and money entries.</p>
              </div>
            ) : messages.map((m) => {
              const texts = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text");
              const uses = m.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
              if (m.role === "user") {
                if (!texts.length) return null; // tool results show as the cards under her message
                return (
                  <div key={m.id} className="flex justify-end" data-message="user">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white">{texts.map((t) => t.text).join("\n")}</div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex gap-3" data-message="assistant">
                  <Avatar name={name} />
                  <div className="min-w-0 max-w-[85%] space-y-2">
                    {texts.length ? <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-800/70 px-4 py-2.5 text-sm text-slate-100">{texts.map((t) => t.text).join("\n")}</div> : null}
                    {uses.map((u) => {
                      const a = byUse.get(u.id);
                      if (a) return <ActionCard key={u.id} a={a} threadId={thread.id} />;
                      return <div key={u.id} className="flex items-center gap-1.5 text-xs text-slate-500"><Wrench className="h-3.5 w-3.5" />{toolByName(u.name)?.describe(u.input) ?? u.name}</div>;
                    })}
                    {m.provider ? <div className="text-[11px] text-slate-600">{aiProviderName(m.provider)}{m.model && m.model !== "mock" ? ` · ${m.model}` : ""}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-800 p-3 sm:p-4">
            <Composer
              action={sendMessage}
              threadId={thread?.id ?? null}
              name={name}
              providers={ready.map((p) => ({ id: p, label: aiProviderName(p) }))}
              current={thread?.provider ?? "auto"}
              suggestions={suggestions}
            />
            {thread ? (
              <form action={removeThread} className="mt-2 text-right">
                <input type="hidden" name="threadId" value={thread.id} />
                <ConfirmButton title="Delete this conversation?" body="Every message in it is deleted for good. This cannot be undone." confirm="Delete conversation" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" />Delete this conversation</ConfirmButton>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

async function SettingsView({ user, policy, roleParam }: { user: UserRow; policy: Awaited<ReturnType<typeof policyFor>>; roleParam?: string }) {
  const owner = user.role === "super_admin";
  const actions = await recentActions(user.id, 30);
  const role = isRole(roleParam) ? roleParam : "admin";
  const [roleSet, integrations] = owner ? await Promise.all([rolePolicy(role), listIntegrations()]) : [{}, []];
  const aiStatus = new Map(integrations.map((i) => [i.provider, i.status]));
  const roleModeOf = (c: (typeof CATEGORIES)[number]["id"]): Mode => policy.roleSet[c] ?? defaultMode(user.role, c);
  const rank = { off: 0, ask: 1, auto: 2 } as const;

  return (
    <div className="space-y-6">
      <section className={`${card} p-6`} data-my-policy>
        <h3 className="text-sm font-semibold text-white">What she may do for you</h3>
        <p className="mt-1 text-xs text-slate-500">You can make her more careful than your role allows, never less. Money always waits for your yes.</p>
        <form action={saveMyPolicy} className="mt-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-4 font-medium">Kind of work</th><th className="py-2 pr-4 font-medium">Your role allows</th><th className="py-2 pr-4 font-medium">For you</th><th className="py-2 font-medium">In force now</th></tr></thead>
              <tbody>
                {CATEGORIES.map((c) => {
                  const roleMode = roleModeOf(c.id);
                  return (
                    <tr key={c.id} className="border-t border-slate-800">
                      <td className="py-2 pr-4"><div className="text-white">{c.label}</div><div className="text-xs text-slate-500">{c.note}</div></td>
                      <td className="py-2 pr-4 text-slate-300">{MODE_LABEL[roleMode]}</td>
                      <td className="py-2 pr-4">
                        <select name={`mode_${c.id}`} defaultValue={policy.userSet[c.id] ?? "role"} className={input} aria-label={`${c.label} for you`} disabled={roleMode === "off"}>
                          <option value="role">Same as my role</option>
                          {MODES.filter((m) => rank[m] <= rank[roleMode]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                        </select>
                      </td>
                      <td className="py-2 text-slate-200" data-mode={c.id}>{MODE_LABEL[policy.modes[c.id]]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {policy.fullAgentAllowed ? (
            <label className="flex items-start gap-3 rounded-lg border border-slate-700 p-3 text-sm">
              <input type="checkbox" name="fullAgent" defaultChecked={policy.fullAgent} className="mt-1" />
              <span><span className="font-medium text-white">Full agent</span><span className="block text-xs text-slate-400">She acts on her own in everything your role allows and tells you afterwards. Money still waits for your yes. Every action is logged below.</span></span>
            </label>
          ) : <p className="text-xs text-slate-500">Full agent mode is not enabled for your role.</p>}
          <button className={btn}>Save</button>
        </form>
      </section>

      {owner ? (
        <>
          <section className={`${card} p-6`} data-assistant-settings>
            <h3 className="text-sm font-semibold text-white">Her name and AI services</h3>
            <p className="mt-1 text-xs text-slate-500">She tries the services in this order and moves to the next if one fails. Set each one up under Integrations → AI assistant.</p>
            <form action={saveAssistantSettings} className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Name<input name="name" defaultValue={policy.settings.name} maxLength={40} className={`${input} mt-1 block w-full`} /></label>
              <div className="text-sm text-slate-300">
                Order
                <div className="mt-1 space-y-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <select key={i} name="providers" defaultValue={policy.settings.providers[i] ?? AI_PROVIDERS[i].id} className={`${input} block w-full`} aria-label={`Choice ${i + 1}`}>
                      {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{i + 1}. {p.name}{aiStatus.get(p.id) && aiStatus.get(p.id) !== "disconnected" ? "" : " (not set up)"}</option>)}
                    </select>
                  ))}
                </div>
              </div>
              <fieldset className="md:col-span-2">
                <legend className="text-sm text-slate-300">Roles that may switch on full agent</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" name="fullAgentRoles" value={r} defaultChecked={policy.settings.full_agent_roles.includes(r)} disabled={r === "super_admin"} />
                      {ROLE_META[r].label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="md:col-span-2"><button className={btn}>Save</button></div>
            </form>
          </section>

          <section className={`${card} p-6`} data-role-policy>
            <h3 className="text-sm font-semibold text-white">What she may do for each role</h3>
            <nav aria-label="Roles" className="mt-3 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <Link key={r} href={`/portal/assistant?view=settings&role=${r}`} className={`rounded-full border px-3 py-1 text-sm ${r === role ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>{ROLE_META[r].label}</Link>
              ))}
            </nav>
            <form action={saveRolePolicy} className="mt-4 space-y-3">
              <input type="hidden" name="role" value={role} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map((c) => (
                  <label key={c.id} className="text-sm text-slate-300">
                    {c.label}
                    <select name={`mode_${c.id}`} defaultValue={(roleSet as Record<string, Mode>)[c.id] ?? "default"} className={`${input} mt-1 block w-full`}>
                      <option value="default">Default ({MODE_LABEL[defaultMode(role, c.id)]})</option>
                      {MODES.filter((m) => !CEILING[c.id] || rank[m] <= rank[CEILING[c.id]!]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <button className={btn}>Save for {ROLE_META[role].label}</button>
            </form>
          </section>
        </>
      ) : null}

      <section className={`${card} p-6`} data-action-log>
        <h3 className="text-sm font-semibold text-white">What she has done for you</h3>
        {actions.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-800">
            {actions.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-slate-200">{toolByName(a.tool)?.describe(a.input) ?? a.tool}</span>
                  {a.result ? <span className="block truncate text-xs text-slate-500">{a.result}</span> : null}
                </span>
                <span className={`shrink-0 text-xs ${STATUS[a.status].tone}`}>
                  {a.status === "rejected" ? <CircleSlash className="mr-1 inline h-3 w-3" /> : null}
                  {STATUS[a.status].label}{a.auto ? " · on her own" : ""} · {a.created_at.slice(0, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
