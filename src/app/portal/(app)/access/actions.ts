"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { looksLikeEmail, normalizeEmail } from "@/lib/admin-emails";
import { requireAccessManager } from "@/lib/dal";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { assignableRoles, canManageRole, isRole } from "@/lib/rbac";
import { cleanMemberships, enterable, workspaceLabel } from "@/lib/workspace-calc";
import { setMemberships, workspaceContext } from "@/lib/workspaces";
import { setRequiredRoles } from "@/lib/mfa";
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

  // Workspaces: those ticked that the inviter can enter themselves; else the one they are in now.
  const mine = enterable(admin.role, admin.workspaces);
  let spaces = cleanMemberships(formData.getAll("workspace")).filter((w) => mine.includes(w));
  if (spaces.length === 0) {
    const { view } = await workspaceContext();
    spaces = [view === "impact_marrow" ? "impact_marrow" : "boring_pe"];
  }

  const tempPassword = withPassword ? generateTemporaryPassword() : undefined;
  const created = await createUser({
    email,
    name,
    role,
    passwordHash: tempPassword ? await hashPassword(tempPassword) : null,
    mustChangePassword: Boolean(tempPassword),
    createdBy: admin.id,
  });
  if (created) await setMemberships(created.id, spaces);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "invited",
    targetEmail: email,
    detail: `role ${role}${tempPassword ? ", temporary password" : ""}; ${spaces.map(workspaceLabel).join(" and ")}`,
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

/**
 * Which of Boring PE and Impact Marrow a seat can enter. An Admin can only give or take away the
 * workspaces they enter themselves; Personal is never given to anyone.
 */
export async function setWorkspaces(formData: FormData) {
  const admin = await requireAccessManager();
  const target = await getUserById(String(formData.get("userId") ?? ""));
  if (!target) back("invalid");
  if (target.id === admin.id) back("self");
  if (target.role === "super_admin" || !canManageRole(admin.role, target.role)) back("not-allowed");
  const mine = enterable(admin.role, admin.workspaces);
  const ticked = cleanMemberships(formData.getAll("workspace")).filter((w) => mine.includes(w));
  const kept = cleanMemberships(target.workspaces).filter((w) => !mine.includes(w));
  const next = cleanMemberships([...kept, ...ticked]);
  if (next.length === 0) back("no-workspace");
  await setMemberships(target.id, next);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "workspaces_changed",
    targetEmail: target.email,
    detail: next.map(workspaceLabel).join(" and "),
  });
  back("workspaces-saved");
}

/** The Super Admin chooses which roles must use two-step sign-in. */
export async function saveTwoStepRoles(formData: FormData) {
  const admin = await requireAccessManager();
  if (admin.role !== "super_admin") back("not-allowed");
  const roles = formData.getAll("roles").map(String).filter((r) => isRole(r));
  await setRequiredRoles(roles);
  await audit({ actorId: admin.id, actorEmail: admin.email, action: "2fa_required", detail: roles.join(", ") || "none" });
  back("two-step-saved");
}
