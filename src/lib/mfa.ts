import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getSql } from "./db";
import { seal, unseal } from "./crypto-box";
import { hashRecovery, newSecret, otpauthUrl, recoveryCodes, verifyTotp } from "./totp";

export const MFA_COOKIE = "bp_2fa";
export const TRUST_COOKIE = "bp_trusted";
const TRUST_DAYS = 30;

type MfaUser = { id: string; email: string; role: string; session_epoch: number };

const secretKey = () => process.env.AUTH_SECRET ?? "dev-secret";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const secure = () => (process.env.AUTH_URL ?? "").startsWith("https://");

/** A fingerprint of this browser's sign-in session, so a passed code belongs to this session only. */
async function sessionFingerprint() {
  const jar = await cookies();
  const raw = jar.getAll().filter((c) => c.name.includes("authjs.session-token")).map((c) => c.value).join("");
  return raw ? sha(raw) : "";
}

function proof(userId: string, epoch: number, fp: string) {
  return createHmac("sha256", secretKey()).update(`2fa|${userId}|${epoch}|${fp}`).digest("hex");
}

async function state(userId: string) {
  const sql = await getSql();
  return (await sql.query<{ totp_enabled: boolean; totp_secret: string | null; totp_last_step: string | null; recovery_hashes: string[] }>(
    "select totp_enabled, totp_secret, totp_last_step::text, recovery_hashes from users where id = $1",
    [userId],
  ))[0];
}

export async function twoFactorOn(userId: string) {
  return (await state(userId))?.totp_enabled ?? false;
}

/** Roles the Super Admin requires to use a second step. */
export async function requiredRoles(): Promise<string[]> {
  const sql = await getSql();
  return (await sql.query<{ require_2fa_roles: string[] }>("select require_2fa_roles from security_settings where id"))[0]?.require_2fa_roles ?? [];
}
export async function setRequiredRoles(roles: string[]) {
  const sql = await getSql();
  await sql.query("update security_settings set require_2fa_roles = $1::text[], updated_at = now() where id", [roles]);
}

/** Someone whose role requires two-step sign-in but who has not set it up yet. */
export async function mustEnroll(user: MfaUser) {
  return !(await twoFactorOn(user.id)) && (await requiredRoles()).includes(user.role);
}

/** Has this session passed the second step (or does it not need one)? */
export async function secondStepDone(user: MfaUser): Promise<boolean> {
  if (!(await twoFactorOn(user.id))) return true;
  const jar = await cookies();
  const fp = await sessionFingerprint();
  const have = jar.get(MFA_COOKIE)?.value ?? "";
  const want = proof(user.id, user.session_epoch, fp);
  if (have.length === want.length && timingSafeEqual(Buffer.from(have), Buffer.from(want))) return true;
  const trust = jar.get(TRUST_COOKIE)?.value;
  if (!trust) return false;
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    "update trusted_devices set last_used_at = now() where token_hash = $1 and user_id = $2 and expires_at > now() returning id",
    [sha(trust), user.id],
  );
  return rows.length > 0;
}

async function markPassed(user: MfaUser, trust: boolean) {
  const jar = await cookies();
  jar.set(MFA_COOKIE, proof(user.id, user.session_epoch, await sessionFingerprint()), {
    httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 60 * 60 * 8,
  });
  if (trust) {
    const token = randomBytes(32).toString("base64url");
    const ua = ((await headers()).get("user-agent") ?? "").slice(0, 160);
    const sql = await getSql();
    await sql.query(
      `insert into trusted_devices (user_id, token_hash, label, expires_at) values ($1, $2, $3, now() + interval '${TRUST_DAYS} days')`,
      [user.id, sha(token), deviceLabel(ua)],
    );
    jar.set(TRUST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: TRUST_DAYS * 86400 });
  }
}

function deviceLabel(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" on ");
}

/** A code from the authenticator app, or a single-use recovery code. */
export async function verifySecondStep(user: MfaUser, code: string, trust: boolean): Promise<"ok" | "wrong"> {
  const s = await state(user.id);
  if (!s?.totp_enabled || !s.totp_secret) return "wrong";
  const secret = unseal<{ s: string }>(s.totp_secret)?.s;
  const sql = await getSql();
  if (secret) {
    const matched = verifyTotp(secret, code, Date.now(), s.totp_last_step === null ? null : Number(s.totp_last_step));
    if (matched !== null) {
      await sql.query("update users set totp_last_step = $2 where id = $1", [user.id, matched]);
      await markPassed(user, trust);
      return "ok";
    }
  }
  const h = hashRecovery(code);
  if (/^[A-Za-z2-7]{4}-?[A-Za-z2-7]{4}$/.test(code.trim()) && s.recovery_hashes.includes(h)) {
    await sql.query("update users set recovery_hashes = array_remove(recovery_hashes, $2) where id = $1", [user.id, h]);
    await markPassed(user, trust);
    return "ok";
  }
  return "wrong";
}

/** Starts setting up: a fresh secret, kept but not active until a code from the app confirms it. */
export async function beginEnrollment(user: MfaUser) {
  const s = await state(user.id);
  let secret = s?.totp_secret && !s.totp_enabled ? unseal<{ s: string }>(s.totp_secret)?.s : null;
  if (!secret) {
    secret = newSecret();
    const sql = await getSql();
    await sql.query("update users set totp_secret = $2 where id = $1 and not totp_enabled", [user.id, seal({ s: secret })]);
  }
  return { secret, url: otpauthUrl(secret, user.email) };
}

export async function pendingSecret(userId: string) {
  const s = await state(userId);
  return s?.totp_secret && !s.totp_enabled ? unseal<{ s: string }>(s.totp_secret)?.s ?? null : null;
}

/** Confirms with a first code and turns it on. Returns the recovery codes, shown once. */
export async function confirmEnrollment(user: MfaUser, code: string): Promise<string[] | null> {
  const secret = await pendingSecret(user.id);
  if (!secret) return null;
  const matched = verifyTotp(secret, code, Date.now());
  if (matched === null) return null;
  const { codes, hashes } = recoveryCodes();
  const sql = await getSql();
  await sql.query("update users set totp_enabled = true, totp_last_step = $2, recovery_hashes = $3::text[] where id = $1", [user.id, matched, hashes]);
  await markPassed(user, false);
  return codes;
}

export async function newRecoveryCodes(userId: string) {
  const { codes, hashes } = recoveryCodes();
  const sql = await getSql();
  await sql.query("update users set recovery_hashes = $2::text[] where id = $1 and totp_enabled", [userId, hashes]);
  return codes;
}

export async function disableTwoFactor(userId: string) {
  const sql = await getSql();
  await sql.query("update users set totp_enabled = false, totp_secret = null, totp_last_step = null, recovery_hashes = '{}' where id = $1", [userId]);
  await sql.query("delete from trusted_devices where user_id = $1", [userId]);
}

export async function recoveryLeft(userId: string) {
  return (await state(userId))?.recovery_hashes.length ?? 0;
}

export async function listDevices(userId: string) {
  const sql = await getSql();
  return sql.query<{ id: string; label: string; created_at: string; last_used_at: string; expires_at: string }>(
    "select id, label, created_at::text, last_used_at::text, expires_at::text from trusted_devices where user_id = $1 and expires_at > now() order by last_used_at desc",
    [userId],
  );
}
export async function forgetDevice(userId: string, id: string) {
  const sql = await getSql();
  await sql.query("delete from trusted_devices where user_id = $1 and id = $2", [userId, id]);
}
