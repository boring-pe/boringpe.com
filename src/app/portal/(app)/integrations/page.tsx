import Link from "next/link";
import { headers } from "next/headers";
import { requireSuperAdmin } from "@/lib/dal";
import { API_SCOPES, PROVIDERS, WEBHOOK_EVENTS } from "@/lib/integration-catalog";
import { listApiKeys, listIntegrations, listWebhooks, recentLog } from "@/lib/integrations";
import { keyAction, newApiKey, newWebhook, saveService, serviceAction, webhookAction } from "./actions";
import { NewKeyForm, NewWebhookForm } from "./create-forms";
import { ConfirmButton } from "../_shell/buttons";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  connected: { text: "Saved and the connection test passed." },
  "test-ok": { text: "Connection test passed." },
  "test-failed": { text: "Saved, but the connection test failed. See the activity log.", bad: true },
  missing: { text: "Saved; some required fields are still empty.", bad: true },
  disconnected: { text: "Disconnected and its secrets removed." },
  revoked: { text: "Key revoked. Anything using it stops working now." },
  removed: { text: "Endpoint removed." },
  "ping-ok": { text: "Test event delivered." },
  "ping-failed": { text: "Test event failed. See the endpoint's last status.", bad: true },
  invalid: { text: "That was not valid.", bad: true },
};
const VIEWS = [["services", "Services"], ["api", "API keys"], ["webhooks", "Webhooks"], ["log", "Activity"]] as const;
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const BADGE: Record<string, string> = { connected: "bg-green-500/15 text-green-300", error: "bg-red-500/15 text-red-300", disconnected: "bg-slate-700/50 text-slate-400" };

async function baseUrl() {
  const fromEnv = process.env.AUTH_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ view?: string; notice?: string; p?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const view = VIEWS.some(([id]) => id === sp.view) ? sp.view! : "services";
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Integrations</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">Connect outside services, give other tools an API key, and send events to them by webhook. Secrets are stored encrypted and never shown again.</p>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}
      <nav aria-label="Integration sections" className="flex flex-wrap gap-1 border-b border-slate-800">
        {VIEWS.map(([id, label]) => <Link key={id} href={`/portal/integrations?view=${id}`} className={`px-4 py-2 text-sm -mb-px border-b-2 ${view === id ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>{label}</Link>)}
      </nav>
      {view === "services" ? <Services open={sp.p} /> : view === "api" ? <ApiKeys /> : view === "webhooks" ? <Webhooks /> : <Log />}
    </div>
  );
}

async function Services({ open }: { open?: string }) {
  const [states, base] = await Promise.all([listIntegrations(), baseUrl()]);
  const urls: Record<string, [string, string]> = {
    google: ["Redirect URL", `${base}/api/integrations/oauth/google/callback`],
    microsoft: ["Redirect URL", `${base}/api/integrations/oauth/microsoft/callback`],
    zoho: ["Redirect URL", `${base}/api/integrations/oauth/zoho/callback`],
    digilocker: ["Callback URL", `${base}/api/kyc/callback`],
    entity_locker: ["Callback URL", `${base}/api/kyc/callback`],
    whatsapp: ["Webhook URL", `${base}/api/webhooks/whatsapp`],
    razorpay: ["Webhook URL", `${base}/api/webhooks/razorpay`],
  };
  const groups = [...new Set(PROVIDERS.map((p) => p.group))];
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{g}</h3>
          {PROVIDERS.filter((p) => p.group === g).map((p) => {
            const st = states.find((s) => s.provider === p.id);
            const status = st?.status ?? "disconnected";
            return (
              <details key={p.id} open={open === p.id} className={`${card} p-5`} data-provider={p.id}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                  <span><span className="font-semibold text-white">{p.name}</span><span className="ml-2 text-sm text-slate-400">{p.summary}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${BADGE[status]}`} data-status>{status}</span>
                </summary>
                <div className="mt-4 space-y-4">
                  <p className="text-xs text-slate-500">{p.setup}</p>
                  {urls[p.id] ? <p className="text-xs text-slate-400">{urls[p.id][0]}: <code className="break-all rounded bg-slate-950 px-1.5 py-0.5 text-slate-200">{urls[p.id][1]}</code></p> : null}
                  {st?.last_error ? <p className="text-xs text-red-300">Last check: {st.last_error}</p> : null}
                  <form action={saveService} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="provider" value={p.id} />
                    {p.fields.map((f) => (
                      <label key={f.key} className="text-xs text-slate-500">
                        {f.label}{f.required ? " *" : ""}
                        <input
                          name={f.key} type={f.secret ? "password" : "text"} autoComplete="off"
                          defaultValue={f.secret ? "" : st?.config[f.key] ?? ""}
                          placeholder={f.secret && st?.secretKeys.includes(f.key) ? "•••••• saved (leave blank to keep)" : f.placeholder ?? ""}
                          className={`${input} mt-1`}
                        />
                      </label>
                    ))}
                    <div className="flex gap-3 md:col-span-2">
                      <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Save and test</button>
                    </div>
                  </form>
                  {status !== "disconnected" ? (
                    <form action={serviceAction} className="flex gap-3">
                      <input type="hidden" name="provider" value={p.id} />
                      <button name="what" value="test" className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white">Test again</button>
                      <button name="what" value="disconnect" className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:text-red-200">Disconnect</button>
                    </form>
                  ) : null}
                </div>
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}

async function ApiKeys() {
  const [keys, base] = await Promise.all([listApiKeys(), baseUrl()]);
  return (
    <div className="space-y-6">
      <section className={`${card} p-6 space-y-3`}>
        <h3 className="text-sm font-semibold text-white">New API key</h3>
        <p className="text-xs text-slate-500">
          Send it as <code className="text-slate-300">Authorization: Bearer &lt;key&gt;</code>. Endpoints: <code className="text-slate-300">GET {base}/api/v1/me</code>, <code className="text-slate-300">/entities</code>, <code className="text-slate-300">/invoices</code>, <code className="text-slate-300">/money</code>, <code className="text-slate-300">/trial-balance?entity=</code>; <code className="text-slate-300">POST /money</code> (money in) and <code className="text-slate-300">POST /tasks</code>. A key acts as you; payments out can never be made by key.
        </p>
        <NewKeyForm action={newApiKey} scopes={[...API_SCOPES]} />
      </section>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Name</th><th className={th}>Key</th><th className={th}>Permissions</th><th className={th}>Last used</th><th className={th}></th></tr></thead>
          <tbody>
            {keys.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">No keys yet.</td></tr> : keys.map((k) => (
              <tr key={k.id} className="border-t border-slate-800" data-key={k.name}>
                <td className={td}>{k.name}<div className="text-xs text-slate-500">{k.created_at} · {k.creator}</div></td>
                <td className={td}><code>{k.prefix}…</code></td><td className={td}>{k.scopes.join(", ")}</td><td className={td}>{k.last_used_at ?? "never"}</td>
                <td className={td}>{k.revoked_at ? <span className="text-red-300">Revoked</span> : <form action={keyAction}><input type="hidden" name="id" value={k.id} /><ConfirmButton title={`Revoke the key ${k.name}?`} body="Anything using this key stops working at once. A revoked key cannot be turned back on; you would create a new one." confirm="Revoke key" className="text-xs text-red-300 hover:text-red-200">Revoke</ConfirmButton></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function Webhooks() {
  const hooks = await listWebhooks();
  return (
    <div className="space-y-6">
      <section className={`${card} p-6 space-y-3`}>
        <h3 className="text-sm font-semibold text-white">New endpoint</h3>
        <p className="text-xs text-slate-500">
          Each event is POSTed as JSON with <code className="text-slate-300">X-BoringPE-Signature: t=…,v1=…</code>: an HMAC-SHA256 of <code className="text-slate-300">t.body</code> with the signing secret, so the receiver can check it came from here.
        </p>
        <NewWebhookForm action={newWebhook} events={WEBHOOK_EVENTS} />
      </section>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>URL</th><th className={th}>Events</th><th className={th}>Last delivery</th><th className={th}></th></tr></thead>
          <tbody>
            {hooks.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-sm text-slate-500">No endpoints yet.</td></tr> : hooks.map((h) => (
              <tr key={h.id} className="border-t border-slate-800" data-webhook={h.url}>
                <td className={`${td} break-all`}>{h.url}</td><td className={td}>{h.events.join(", ")}</td>
                <td className={td}>{h.last_at ? `${h.last_at} · ${h.last_ok ? "ok" : "failed"}${h.last_status ? ` (${h.last_status})` : ""}` : "none yet"}</td>
                <td className={td}>
                  <form action={webhookAction} className="flex gap-3"><input type="hidden" name="id" value={h.id} />
                    <button name="what" value="ping" className="text-xs text-blue-300 hover:text-blue-200">Send test</button>
                    <ConfirmButton name="what" value="remove" title="Remove this webhook?" body={`Events will no longer be sent to ${h.url}.`} confirm="Remove webhook" className="text-xs text-red-300 hover:text-red-200">Remove</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function Log() {
  const rows = await recentLog();
  return (
    <section className={`${card} overflow-x-auto`}>
      <table className="w-full">
        <thead><tr><th className={th}>When</th><th className={th}>Service</th><th className={th}>What</th><th className={th}>Result</th><th className={th}>By</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-500">Nothing yet.</td></tr> : rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-800">
              <td className={td}>{r.created_at}</td><td className={td}>{r.provider}</td><td className={td}>{r.action}</td>
              <td className={`${td} ${r.ok ? "text-green-300" : "text-red-300"}`}>{r.message}</td><td className={td}>{r.actor_email ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
