"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dal";
import { verifySecondStep } from "@/lib/mfa";
import { audit, recordFailedLogin } from "@/lib/users";

export async function submitCode(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");
  if (user.locked_until && user.locked_until.getTime() > Date.now()) redirect("/portal/two-factor?e=1");
  const code = String(formData.get("code") ?? "").trim().slice(0, 20);
  const trust = formData.get("trust") === "on";
  if ((await verifySecondStep(user, code, trust)) !== "ok") {
    // Wrong codes count toward the same lock as wrong passwords.
    await recordFailedLogin(user.id);
    await audit({ actorId: user.id, actorEmail: user.email, action: "2fa_failed" });
    redirect("/portal/two-factor?e=1");
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: "2fa_passed", detail: trust ? "trusted this device" : "" });
  redirect("/portal");
}
