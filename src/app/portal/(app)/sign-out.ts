"use server";

import { signOut } from "@/auth";
import { getSessionUser } from "@/lib/dal";
import { audit } from "@/lib/users";

export async function signOutAction() {
  await signOut({ redirectTo: "/portal/login" });
}

/** Called by the page after a stretch without activity. */
export async function idleSignOut() {
  const user = await getSessionUser();
  if (user) await audit({ actorId: user.id, actorEmail: user.email, action: "idle_sign_out" });
  await signOut({ redirectTo: "/portal/login?idle=1" });
}
