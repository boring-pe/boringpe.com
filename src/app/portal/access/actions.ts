"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { firstAllowedHref, parseRole } from "@/lib/rbac";

export async function setPortalRole(formData: FormData) {
  const jar = await cookies();
  const current = parseRole(jar.get("bp_preview")?.value);
  const next = parseRole(String(formData.get("role") ?? ""));
  if (current !== "superadmin" && next !== "superadmin") {
    redirect(firstAllowedHref(current));
  }
  if (next === "superadmin") {
    jar.delete("bp_preview");
  } else {
    jar.set("bp_preview", next, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  redirect(next === "superadmin" ? "/portal/access" : firstAllowedHref(next));
}
