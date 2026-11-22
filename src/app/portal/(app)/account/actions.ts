"use server";

import { signOut } from "@/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import {
  beginEnrollment, confirmEnrollment, disableTwoFactor, forgetDevice, newRecoveryCodes, requiredRoles, verifySecondStep,
} from "@/lib/mfa";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { audit, revokeSessions, setPassword } from "@/lib/users";

export type AccountState = { message: string } | null;

export async function changePassword(_: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // Accounts that only ever used Google, LinkedIn or email links have no password to confirm.
  if (user.password_hash && !(await verifyPassword(current, user.password_hash))) {
    return { message: "Your current password is not right." };
  }
  if (next !== confirm) return { message: "The two new passwords do not match." };
  const problem = passwordProblem(next, user.email);
  if (problem) return { message: problem };
  if (current && next === current) return { message: "Choose a password you have not used here." };

  await setPassword(user.id, await hashPassword(next), false);
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "password_changed",
    targetEmail: user.email,
  });
  // The change ends every session, this one included.
  await signOut({ redirectTo: "/portal/login?changed=1" });
  return null;
}

export async function endMySessions() {
  const user = await requireUser();
  await revokeSessions(user.id);
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "sessions_revoked",
    targetEmail: user.email,
    detail: "by the user",
  });
  await signOut({ redirectTo: "/portal/login" });
}

// ---- two-step sign-in

export async function startTwoFactor() {
  const user = await requireUser();
  await beginEnrollment(user);
  redirect("/portal/account?enroll=1#two-step");
}

export async function confirmTwoFactor(formData: FormData) {
  const user = await requireUser();
  const codes = await confirmEnrollment(user, String(formData.get("code") ?? ""));
  if (!codes) redirect("/portal/account?enroll=1&tf=wrong#two-step");
  await audit({ actorId: user.id, actorEmail: user.email, action: "2fa_on" });
  await showCodesOnce(codes);
  redirect("/portal/account?tf=on#two-step");
}

export async function turnOffTwoFactor(formData: FormData) {
  const user = await requireUser();
  if ((await requiredRoles()).includes(user.role)) redirect("/portal/account?tf=required#two-step");
  if ((await verifySecondStep(user, String(formData.get("code") ?? ""), false)) !== "ok") redirect("/portal/account?tf=wrong#two-step");
  await disableTwoFactor(user.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: "2fa_off" });
  redirect("/portal/account?tf=off#two-step");
}

export async function freshRecoveryCodes() {
  const user = await requireUser();
  const codes = await newRecoveryCodes(user.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: "2fa_recovery_codes" });
  await showCodesOnce(codes);
  redirect("/portal/account?tf=codes#two-step");
}

export async function forgetTrustedDevice(formData: FormData) {
  const user = await requireUser();
  await forgetDevice(user.id, String(formData.get("id") ?? ""));
  redirect("/portal/account?tf=forgot#two-step");
}

/** Recovery codes travel to the page in a two-minute cookie, never in the address bar or logs. */
async function showCodesOnce(codes: string[]) {
  (await cookies()).set("bp_codes", codes.join(","), { httpOnly: true, sameSite: "strict", path: "/portal/account", maxAge: 120, secure: (process.env.AUTH_URL ?? "").startsWith("https://") });
}
