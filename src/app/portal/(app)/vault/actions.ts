"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { createDocument, deleteDocument, linkExists } from "@/lib/documents";
import { oneLine } from "@/lib/ops-fields";
import { canSeeFirmData } from "@/lib/rbac";
import { audit } from "@/lib/users";
import { MAX_DOC_BYTES, isDocCategory, mimeFor, safeFileName } from "@/lib/vault-fields";

function back(notice: string): never {
  redirect(`/portal/vault?notice=${notice}`);
}

/** The Boring PE team (Super Admin, Admins, partners) adds documents. */
export async function upload(formData: FormData) {
  const user = await requireSection("vault");
  if (!canSeeFirmData(user.role)) back("forbidden");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("no-file");
  if (file.size > MAX_DOC_BYTES) back("too-big");
  const fileName = safeFileName(file.name);
  const mime = mimeFor(fileName);
  if (!mime) back("type");
  const title = oneLine(formData.get("title"), 200) || fileName;
  const category = formData.get("category");
  if (!isDocCategory(category)) back("invalid");
  const visibility = formData.get("visibility") === "linked" ? "linked" : "firm";
  const [type, id] = String(formData.get("link") ?? "").split(":");
  let link: { type: "entity" | "venture" | "holding"; id: string } | null = null;
  if (type) {
    if ((type !== "entity" && type !== "venture" && type !== "holding") || !id || !(await linkExists(type, id))) back("invalid");
    link = { type, id };
  }
  if (visibility === "linked" && !link) back("needs-link");
  const content = new Uint8Array(await file.arrayBuffer());
  await createDocument({ title, category, visibility, link, fileName, mime, content, by: user.id });
  await audit({ actorId: user.id, actorEmail: user.email, action: "document_added", detail: title });
  back("uploaded");
}

export async function remove(formData: FormData) {
  const user = await requireSection("vault");
  if (user.role !== "super_admin") back("forbidden");
  const title = await deleteDocument(String(formData.get("id") ?? ""));
  if (!title) back("invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "document_deleted", detail: title });
  back("deleted");
}
