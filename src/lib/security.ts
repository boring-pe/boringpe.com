import { getSql } from "./db";
import { requiredRoles } from "./mfa";
import { blockedLastDay } from "./rate-limit";
import { IDLE_MINUTES, LIMITS } from "./security-calc";

const EVENTS = [
  "rate_limited", "2fa_failed", "2fa_off", "2fa_required", "sessions_revoked", "everyone_signed_out", "idle_sign_out",
  "export", "download", "backup_downloaded", "role_changed", "password_reset", "password_changed", "api_key_created",
  "secret_added", "secret_deleted", "integration_saved", "invited", "disabled", "enabled",
];

export type SecurityOverview = Awaited<ReturnType<typeof securityOverview>>;

/** Everything the Security page shows. */
export async function securityOverview() {
  const sql = await getSql();
  const [seats, required, blocked, events, exports, failures] = await Promise.all([
    sql.query<{ id: string; email: string; role: string; status: string; totp_enabled: boolean; locked_until: Date | null; failed_attempts: number; last_sign_in_at: Date | null }>(
      `select id, email, role, status, coalesce(totp_enabled, false) as totp_enabled, locked_until, failed_attempts, last_sign_in_at
         from users order by status, role, email`,
    ),
    requiredRoles(),
    blockedLastDay(),
    sql.query<{ id: string; actor_email: string | null; action: string; target_email: string | null; detail: string | null; created_at: Date }>(
      `select id::text, actor_email, action, target_email, detail, created_at from access_audit
        where action = any($1::text[]) order by created_at desc, id desc limit 40`,
      [EVENTS],
    ),
    sql.query<{ actor_email: string; n: string; last: Date }>(
      `select actor_email, count(*)::text as n, max(created_at) as last from access_audit
        where action in ('export', 'download', 'backup_downloaded') and created_at > now() - interval '7 days'
        group by actor_email order by 2 desc limit 20`,
    ),
    sql.query<{ n: string }>(`select count(*)::text as n from access_audit where action = '2fa_failed' and created_at > now() - interval '1 day'`),
  ]);
  const active = seats.filter((u) => u.status === "active");
  const now = Date.now();
  return {
    seats: active,
    withoutTwoStep: active.filter((u) => !u.totp_enabled),
    locked: active.filter((u) => u.locked_until && new Date(u.locked_until).getTime() > now),
    required,
    blocked,
    events,
    exports: exports.map((e) => ({ ...e, n: Number(e.n) })),
    codeFailuresToday: Number(failures[0]?.n ?? 0),
    checks: [
      { name: "Session secret set", ok: !!process.env.AUTH_SECRET, note: "Signs sessions and keys the rate-limit hashes." },
      { name: "Integration key set", ok: !!process.env.INTEGRATIONS_KEY, note: "Encrypts stored credentials and the password vault." },
      { name: "Test mode off", ok: process.env.NODE_ENV !== "production" || !process.env.PORTAL_TEST_MODE, note: "Test mode must never be on in production." },
      { name: "Two-step sign-in required for the Super Admin", ok: required.includes("super_admin"), note: "Set under Access." },
      { name: "Two-step sign-in required for Admins", ok: required.includes("admin"), note: "Set under Access." },
    ],
    protections: [
      `Wrong passwords: each account locks on its own; one address is stopped after ${LIMITS.signInFailIp.limit} in ${LIMITS.signInFailIp.window / 60} minutes, one email after ${LIMITS.signInFailEmail.limit}.`,
      `Sign-in links: at most ${LIMITS.magicLink.limit} an hour to one inbox.`,
      `API keys: ${LIMITS.apiKey.limit} calls a minute each; ${LIMITS.apiBadKey.limit} a minute from one address without a valid key.`,
      `Exports and backups: ${LIMITS.export.limit} an hour per person, each one logged and stamped with who took it; file downloads ${LIMITS.download.limit} an hour.`,
      `Idle sign-out after ${IDLE_MINUTES} minutes; every portal page carries the viewer's email as a faint watermark, on screen and in print.`,
      "Strict browser security headers on both websites and the portal: no framing, no hotlinking, no third-party scripts, HTTPS only.",
      "AI-training crawlers and site copiers are refused on both websites; search engines can still index them.",
    ],
  };
}

/** Signs out every seat except the one asking, by moving their session epoch on. */
export async function signOutEveryoneElse(exceptId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(`update users set session_epoch = session_epoch + 1 where id <> $1 returning id`, [exceptId]);
  return rows.length;
}
