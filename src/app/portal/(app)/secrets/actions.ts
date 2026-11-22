"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { isRole } from "@/lib/rbac";
import { createSecret, deleteSecret, revealSecret, updateSecret } from "@/lib/secrets";
import { audit } from "@/lib/users";

const line = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function addSecret(formData: FormData) {
  const user = await requireSection("secrets");
  const title = line(formData.get("title"), 120);
  const secret = String(formData.get("secret") ?? "").slice(0, 4000);
  const url = line(formData.get("url"), 300);
  if (title.length < 2 || !secret) redirect("/portal/secrets?notice=invalid");
  if (url && !/^https?:\/\//i.test(url)) redirect("/portal/secrets?notice=url");
  const roles = formData.getAll("roles").map(String).filter((r) => isRole(r));
  const share = formData.get("share") === "roles" && roles.length ? "roles" : "private";
  await createSecret(user, { title, username: line(formData.get("username"), 200), url, secret, notes: String(formData.get("notes") ?? "").slice(0, 4000), share, roles });
  await audit({ actorId: user.id, actorEmail: user.email, action: "secret_added", detail: title });
  redirect("/portal/secrets?notice=added");
}

/** Called from the page to show a secret for 30 seconds. Logged every time. */
export async function reveal(id: string) {
  const user = await requireSection("secrets");
  return revealSecret(user, id);
}

export async function changeSecret(formData: FormData) {
  const user = await requireSection("secrets");
  const secret = String(formData.get("secret") ?? "").slice(0, 4000);
  const ok = secret ? await updateSecret(user, String(formData.get("id") ?? ""), secret) : false;
  redirect(`/portal/secrets?notice=${ok ? "changed" : "forbidden"}`);
}

export async function removeSecret(formData: FormData) {
  const user = await requireSection("secrets");
  const title = await deleteSecret(user, String(formData.get("id") ?? ""));
  if (title) await audit({ actorId: user.id, actorEmail: user.email, action: "secret_deleted", detail: title });
  redirect(`/portal/secrets?notice=${title ? "deleted" : "forbidden"}`);
}
