import Link from "next/link";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { ROLE_META, type Role } from "@/lib/rbac";
import { securityOverview } from "@/lib/security";
import { signOutEveryone } from "./actions";
import { ConfirmButton } from "../_shell/buttons";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const when = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "never");
const ACTION_LABEL: Record<string, string> = {
  rate_limited: "Blocked for too many requests",
  "2fa_failed": "Wrong two-step code",
  "2fa_off": "Two-step sign-in turned off",
  "2fa_required": "Two-step rule changed",
  sessions_revoked: "Signed out everywhere",
  everyone_signed_out: "Everyone signed out",
  idle_sign_out: "Signed out for inactivity",
  export: "Exported",
  download: "Downloaded",
  backup_downloaded: "Backup downloaded",
  role_changed: "Role changed",
  password_reset: "Password reset",
  password_changed: "Password changed",
  api_key_created: "API key created",
  secret_added: "Secret added",
  secret_deleted: "Secret deleted",
  integration_saved: "Integration saved",
  invited: "Seat invited",
  disabled: "Seat disabled",
  enabled: "Seat enabled",
};
const BUCKET_LABEL: Record<string, string> = {
  signInFailIp: "Wrong passwords from one address",
  signInFailEmail: "Wrong passwords for one email",
  magicLink: "Sign-in links to one inbox",
  apiKey: "Calls with one API key",
  apiBadKey: "API calls without a valid key",
  webhook: "Webhook calls",
  kycStart: "KYC journeys from one address",
  export: "Exports by one person",
  download: "Downloads by one person",
};
const NOTICE: Record<string, string> = {
  out: "Everyone else is signed out. They must sign in again.",
  confirm: "Tick the box to confirm before signing everyone out.",
};

/** The Super Admin's view of who can get in, what was stopped, and what left the portal. */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ n?: string; c?: string }> }) {
  await requireSection("security");
  const { n, c } = await searchParams;
  const o = await securityOverview();
  const failing = o.checks.filter((x) => !x.ok);
  const totalBlocked = o.blocked.reduce((s, b) => s + b.blocked, 0);

  return (
    <div className="space-y-6" data-security>
      <div>
        <h2 className="text-2xl font-bold text-white">Security</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Who can get in, what was stopped in the last day, and what data left the portal and by whom.</p>
      </div>

      {n && NOTICE[n] ? (
        <p role="status" className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          {NOTICE[n]}{n === "out" && c ? ` (${c})` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["checks", "Settings", failing.length ? `${failing.length} to fix` : "All good", failing.length > 0],
          ["twostep", "Seats without two-step", String(o.withoutTwoStep.length), o.withoutTwoStep.length > 0],
          ["blocked", "Blocked in the last day", String(totalBlocked), false],
          ["locked", "Locked accounts", String(o.locked.length), o.locked.length > 0],
        ].map(([k, label, value, bad]) => (
          <div key={k as string} className={`${card} p-5`} data-kpi={k as string}>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label as string}</div>
            <div className={`mt-2 text-2xl font-semibold ${bad ? "text-amber-400" : "text-white"}`}>{value as string}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-5`} data-checks>
          <h3 className="text-sm font-semibold text-white">Settings</h3>
          <ul className="mt-3 space-y-2">
            {o.checks.map((x) => (
              <li key={x.name} className="flex gap-2 text-sm" data-check={x.ok ? "ok" : "fix"}>
                {x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
                <span><span className="text-white">{x.name}</span><span className="block text-xs text-slate-500">{x.note}</span></span>
              </li>
            ))}
          </ul>
          {failing.some((x) => x.name.startsWith("Two-step")) ? (
            <Link href="/portal/access" className="mt-3 inline-block text-xs text-blue-400">Require two-step sign-in under Access</Link>
          ) : null}
        </section>

        <section className={`${card} p-5`}>
          <h3 className="text-sm font-semibold text-white">What protects the websites and the portal</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            {o.protections.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>

        <section className={`${card} p-5`} data-list="twostep">
          <h3 className="text-sm font-semibold text-white">Seats without two-step sign-in</h3>
          {o.withoutTwoStep.length === 0 ? <p className="mt-3 text-sm text-slate-500">Every active seat uses two-step sign-in.</p> : (
            <ul className="mt-3 divide-y divide-slate-800 text-sm">
              {o.withoutTwoStep.map((u) => (
                <li key={u.id} className="flex justify-between gap-3 py-2"><span className="truncate text-white">{u.email}</span><span className="text-xs text-slate-500">{ROLE_META[u.role as Role]?.label ?? u.role} · last in {when(u.last_sign_in_at)}</span></li>
              ))}
            </ul>
          )}
          {o.locked.length ? (
            <>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-400">Locked now</h4>
              <ul className="mt-1 text-sm">{o.locked.map((u) => <li key={u.id} className="flex justify-between py-1"><span className="text-white">{u.email}</span><span className="text-xs text-slate-500">until {when(u.locked_until)}</span></li>)}</ul>
            </>
          ) : null}
        </section>

        <section className={`${card} p-5`} data-list="blocked">
          <h3 className="text-sm font-semibold text-white">Blocked in the last day</h3>
          {o.blocked.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nothing was blocked.</p> : (
            <ul className="mt-3 divide-y divide-slate-800 text-sm">
              {o.blocked.map((b) => (
                <li key={b.bucket} className="flex justify-between gap-3 py-2" data-bucket={b.bucket}>
                  <span className="text-white">{BUCKET_LABEL[b.bucket] ?? b.bucket}</span>
                  <span className="tabular-nums text-slate-400">{b.blocked} from {b.keys} source{b.keys === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">{o.codeFailuresToday} wrong two-step code{o.codeFailuresToday === 1 ? "" : "s"} today. Addresses and emails are stored only as keyed hashes.</p>
        </section>

        <section className={`${card} p-5`} data-list="exports">
          <h3 className="text-sm font-semibold text-white">Data taken out, last 7 days</h3>
          {o.exports.length === 0 ? <p className="mt-3 text-sm text-slate-500">No exports or downloads.</p> : (
            <ul className="mt-3 divide-y divide-slate-800 text-sm">
              {o.exports.map((e) => (
                <li key={e.actor_email} className="flex justify-between gap-3 py-2"><span className="truncate text-white">{e.actor_email}</span><span className="text-xs text-slate-500">{e.n} · last {when(e.last)}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} p-5`}>
          <h3 className="text-sm font-semibold text-white">Sign everyone else out</h3>
          <p className="mt-2 text-sm text-slate-400">If a device is lost or you suspect someone else has a session, end every session except yours. Everyone signs in again.</p>
          <form action={signOutEveryone} className="mt-3 space-y-3">
            <ConfirmButton name="confirm" value="yes" title="Sign everyone else out?" body="Every session except yours ends now, on every device. Everyone, including Admins and partners, has to sign in again." confirm="Sign everyone out" className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Sign everyone else out</ConfirmButton>
          </form>
        </section>
      </div>

      <section className={`${card} overflow-hidden`} data-list="events">
        <h3 className="px-5 pt-4 text-sm font-semibold text-white">Security events</h3>
        {o.events.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">Nothing yet.</p> : (
          <ul className="mt-2 divide-y divide-slate-800 text-sm">
            {o.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 px-5 py-2" data-event={e.action}>
                <span className="text-xs tabular-nums text-slate-500">{when(e.created_at)}</span>
                <span className="text-white">{ACTION_LABEL[e.action] ?? e.action}</span>
                {e.actor_email ? <span className="text-slate-400">{e.actor_email}</span> : null}
                {e.target_email ? <span className="text-slate-500">→ {e.target_email}</span> : null}
                {e.detail ? <span className="truncate text-xs text-slate-500">{e.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
