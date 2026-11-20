"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { looksLikeEmail, normalizeEmail } from "@/lib/admin-emails";
import { requireAccessManager } from "@/lib/dal";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { assignableRoles, canManageRole, isRole } from "@/lib/rbac";
import {
  audit,
  countActiveWithRole,
  createUser,
  getUserByEmail,
  getUserById,
  revokeSessions,
  setPassword,
  setRole,
  setStatus,
} from "@/lib/users";

export type AccessState = { message?: string; tempPassword?: string; email?: string } | null;

function back(notice: string): never {
  redirect(`/portal/access?notice=${notice}`);
}

export async function inviteUser(_: AccessState, formData: FormData): Promise<AccessState> {
  const admin = await requireAccessManager();
  const email = normalizeEmail(formData.get("email"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 120) || null;
  const role = formData.get("role");
  const withPassword = formData.get("passwordMode") === "generate";

  if (!looksLikeEmail(email)) return { message: "Enter a valid email address." };
  if (!isRole(role)) return { message: "Choose a role." };
  if (!assignableRoles(admin.role).includes(role)) {
    return { message: "Only the Super Admin can create admins." };
  }
  if (await getUserByEmail(email)) return { message: "That email already has a seat." };

  const tempPassword = withPassword ? generateTemporaryPassword() : undefined;
  await createUser({
    email,
    name,
    role,
    passwordHash: tempPassword ? await hashPassword(tempPassword) : null,
    mustChangePassword: Boolean(tempPassword),
    createdBy: admin.id,
  });
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "invited",
    targetEmail: email,
    detail: `role ${role}${tempPassword ? ", temporary password" : ""}`,
  });
  revalidatePath("/portal/access");
  return { email, tempPassword, message: "Invited." };
}

export async function changeRole(formData: FormData) {
  const admin = await requireAccessManager();
  const target = await getUserById(String(formData.get("userId") ?? ""));
  const role = formData.get("role");
  if (!target || !isRole(role)) back("invalid");
  if (target.id === admin.id) back("self");
  if (!canManageRole(admin.role, target.role) || !assignableRoles(admin.role).includes(role)) {
    back("not-allowed");
  }
  if (target.role === role) back("unchanged");
  if (
    target.role === "super_admin" &&
    target.status === "active" &&
    (await countActiveWithRole("super_admin")) <= 1
  ) {
    back("last-admin");
  }
  await setRole(target.id, role);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "role_changed",
    targetEmail: target.email,
    detail: `${target.role} to ${role}`,
  });
  back("role-saved");
}

export async function toggleStatus(formData: FormData) {
  const admin = await requireAccessManager();
  const target = await getUserById(String(formData.get("userId") ?? ""));
  const to = formData.get("to");
  if (!target || (to !== "active" && to !== "disabled")) back("invalid");
  if (target.id === admin.id) back("self");
  if (!canManageRole(admin.role, target.role)) back("not-allowed");
  if (
    to === "disabled" &&
    target.role === "super_admin" &&
    target.status === "active" &&
    (await countActiveWithRole("super_admin")) <= 1
  ) {
    back("last-admin");
  }
  await setStatus(target.id, to);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: to === "disabled" ? "disabled" : "enabled",
    targetEmail: target.email,
  });
  back(to === "disabled" ? "disabled" : "enabled");
}

export async function resetPassword(_: AccessState, formData: FormData): Promise<AccessState> {
  const admin = await requireAccessManager();
  const target = await getUserById(String(formData.get("userId") ?? ""));
  if (!target) return { message: "User not found." };
  if (target.id === admin.id) return { message: "Change your own password under Account." };
  if (!canManageRole(admin.role, target.role)) return { message: "You cannot manage that seat." };
  const tempPassword = generateTemporaryPassword();
  await setPassword(target.id, await hashPassword(tempPassword), true);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "password_reset",
    targetEmail: target.email,
  });
  revalidatePath("/portal/access");
  return { email: target.email, tempPassword, message: "Temporary password set." };
}

export async function signOutEverywhere(formData: FormData) {
  const admin = await requireAccessManager();
  const target = await getUserById(String(formData.get("userId") ?? ""));
  if (!target) back("invalid");
  if (target.id === admin.id) back("self");
  if (!canManageRole(admin.role, target.role)) back("not-allowed");
  await revokeSessions(target.id);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "sessions_revoked",
    targetEmail: target.email,
  });
  back("revoked");
}
