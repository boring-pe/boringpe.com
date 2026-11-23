"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import { signOutEveryoneElse } from "@/lib/security";
import { audit } from "@/lib/users";

/** The emergency brake: every other seat is signed out at once, everywhere. */
export async function signOutEveryone(formData: FormData) {
  const me = await requireSuperAdmin();
  if (formData.get("confirm") !== "yes") redirect("/portal/security?n=confirm");
  const n = await signOutEveryoneElse(me.id);
  await audit({ actorId: me.id, actorEmail: me.email, action: "everyone_signed_out", detail: `${n} seats signed out` });
  redirect(`/portal/security?n=out&c=${n}`);
}
