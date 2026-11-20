import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, firstAllowedHref, type SectionId } from "./rbac";
import { getUserById, type UserRow } from "./users";

/**
 * The single place that decides who is signed in. It re-reads the user from the database
 * on every request, so disabling someone, changing a role or revoking sessions takes
 * effect immediately. The proxy only does a cheap cookie check; this is the real gate.
 */
export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const session = await auth();
  if (!session?.userId) return null;
  const user = await getUserById(session.userId);
  if (!user || user.status !== "active") return null;
  if (user.session_epoch !== session.epoch) return null;
  return user;
});

export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  return user;
}

/** Use at the top of every protected page: layouts do not re-run on client navigation. */
export async function requireSection(section: SectionId): Promise<UserRow> {
  const user = await requireUser();
  if (user.must_change_password) redirect("/portal/account");
  if (!can(user.role, section)) redirect(firstAllowedHref(user.role));
  return user;
}

/** Admins and the Super Admin: may manage access, within the limits in rbac.ts. */
export async function requireAccessManager(): Promise<UserRow> {
  const user = await requireUser();
  if (user.must_change_password || !can(user.role, "access")) {
    redirect(firstAllowedHref(user.role));
  }
  return user;
}

/** The owner only: console, site content, personal desk and approval decisions. */
export async function requireSuperAdmin(): Promise<UserRow> {
  const user = await requireUser();
  if (user.must_change_password || user.role !== "super_admin") {
    redirect(firstAllowedHref(user.role));
  }
  return user;
}
