"use server";

import { signOut } from "@/auth";
import { requireUser } from "@/lib/dal";
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
