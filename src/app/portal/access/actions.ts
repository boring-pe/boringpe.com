"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { firstAllowedHref, parseRole } from "@/lib/rbac";

export async function setPortalRole(formData: FormData) {
  const jar = await cookies();
  const current = parseRole(jar.get("bp_role")?.value);
  const next = parseRole(String(formData.get("role") ?? ""));
  if (current !== "admin" && next !== "admin") {
    redirect(firstAllowedHref(current));
  }
  jar.set("bp_role", next, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next === "admin" ? "/portal/access" : firstAllowedHref(next));
}
