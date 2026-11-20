import Link from "next/link";
import { CheckCircle2, AlertTriangle, Crown } from "lucide-react";
import { countPending, listApprovals } from "@/lib/approvals";
import { APPROVAL_KINDS } from "@/lib/approval-kinds";
import { requireSection } from "@/lib/dal";
import { providerFlags } from "@/lib/providers";
import { ROLES, ROLE_META } from "@/lib/rbac";
import { countSeats, listAudit } from "@/lib/users";

const card = "bg-slate-900 border border-slate-800 rounded-xl";

function when(value: Date) {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export default async function ConsolePage() {
  const me = await requireSection("console");
  const [seats, pendingCount, pending, events] = await Promise.all([
    countSeats(),
    countPending(),
    listApprovals({ status: "pending", limit: 5 }),
    listAudit(10),
  ]);

  const active = (role: string) =>
    seats.filter((row) => row.role === role && row.status === "active").reduce((sum, row) => sum + row.n, 0);
  const off = seats.filter((row) => row.status === "disabled").reduce((sum, row) => sum + row.n, 0);
  const total = seats.reduce((sum, row) => sum + row.n, 0);

  const flags = providerFlags();
  const checks: { ok: boolean; text: string }[] = [
    {
      ok: Boolean(process.env.DATABASE_URL?.trim()),
      text: process.env.DATABASE_URL?.trim()
        ? "Database: Neon Postgres connected."
        : "Database: local embedded Postgres. Set DATABASE_URL before going live.",
    },
    {
      ok: !process.env.ADMIN_BOOTSTRAP_PASSWORD,
      text: process.env.ADMIN_BOOTSTRAP_PASSWORD
        ? "ADMIN_BOOTSTRAP_PASSWORD is still set. Remove it now that you are signed in."
        : "Bootstrap password variable removed.",
    },
    {
      ok: flags.google || flags.linkedin || flags.email,
      text:
        [flags.google && "Google", flags.linkedin && "LinkedIn", flags.email && "email link"]
          .filter(Boolean)
          .join(", ") || "Only email and password sign-in is on. Add Google, LinkedIn or email-link keys to enable more.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold tracking-wide uppercase">
          <Crown className="w-4 h-4" />
          Super Admin
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white">Console</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          One place to run Boring PE and your private desk. Signed in as {me.email}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/portal/approvals" className={`${card} p-5 hover:border-blue-500/50 transition-colors`}>
          <div className="text-3xl font-bold text-white">{pendingCount}</div>
          <div className="mt-1 text-sm text-slate-400">
            {pendingCount === 1 ? "request" : "requests"} waiting for you
          </div>
        </Link>
        <Link href="/portal/access" className={`${card} p-5 hover:border-blue-500/50 transition-colors`}>
          <div className="text-3xl font-bold text-white">{total - off}</div>
          <div className="mt-1 text-sm text-slate-400">active seats{off ? `, ${off} switched off` : ""}</div>
        </Link>
        <Link href="/portal/content" className={`${card} p-5 hover:border-blue-500/50 transition-colors`}>
          <div className="text-base font-semibold text-white">Site content</div>
          <div className="mt-1 text-sm text-slate-400">Edit boringpe.com and rahulmane.com</div>
        </Link>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Waiting for your decision</h3>
          <Link href="/portal/approvals" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
            Open approvals
          </Link>
        </div>
        {pending.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">Nothing is waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80 text-sm">
            {pending.map((item) => (
              <li key={item.id} className="px-6 py-3 flex flex-wrap items-baseline gap-x-3">
                <span className="text-xs text-slate-500">{when(item.created_at)}</span>
                <span className="text-xs uppercase tracking-wide text-blue-400">
                  {APPROVAL_KINDS.find((kind) => kind.id === item.kind)?.label}
                </span>
                <span className="text-white">{item.title}</span>
                <span className="text-xs text-slate-500">from {item.requested_by_email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">Seats by role</h3>
          <ul className="space-y-2 text-sm">
            {ROLES.map((role) => (
              <li key={role} className="flex justify-between">
                <span className="text-slate-300">{ROLE_META[role].label}</span>
                <span className="text-white font-medium">{active(role)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">System checks</h3>
          <ul className="space-y-3 text-sm">
            {checks.map((check) => (
              <li key={check.text} className="flex items-start gap-2">
                {check.ok ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                )}
                <span className="text-slate-300">{check.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Latest activity</h3>
        </div>
        {events.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80 text-sm">
            {events.map((event) => (
              <li key={event.id} className="px-6 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs text-slate-500">{when(event.created_at)}</span>
                <span className="text-white">{event.action.replace(/_/g, " ")}</span>
                {event.target_email ? <span className="text-slate-300">{event.target_email}</span> : null}
                {event.detail ? <span className="text-slate-500">{event.detail}</span> : null}
                <span className="text-xs text-slate-600">by {event.actor_email ?? "system"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
