"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { createDocument, deleteDocument, linkExists, linkedUsers } from "@/lib/documents";
import { createFolder, deleteFolder, getFolder, moveDocument, renameFolder } from "@/lib/drive";
import { notifyUsers } from "@/lib/notify";
import { oneLine } from "@/lib/ops-fields";
import { canSeeFirmData } from "@/lib/rbac";
import { audit } from "@/lib/users";
import { MAX_DOC_BYTES, isDocCategory, mimeFor, safeFileName } from "@/lib/vault-fields";

function back(notice: string, folder?: string | null): never {
  redirect(`/portal/vault?notice=${notice}${folder ? `&f=${encodeURIComponent(folder)}` : ""}`);
}

const folderOf = (formData: FormData) => String(formData.get("folderId") ?? "") || null;

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
  const v = formData.get("visibility");
  const visibility = v === "linked" ? "linked" : v === "private" ? "private" : "firm";
  const folderId = folderOf(formData);
  if (folderId && !(await getFolder(folderId))) back("invalid");
  const [type, id] = String(formData.get("link") ?? "").split(":");
  let link: { type: "entity" | "venture" | "holding"; id: string } | null = null;
  if (type) {
    if ((type !== "entity" && type !== "venture" && type !== "holding") || !id || !(await linkExists(type, id))) back("invalid");
    link = { type, id };
  }
  if (visibility === "linked" && !link) back("needs-link");
  const content = new Uint8Array(await file.arrayBuffer());
  await createDocument({ title, category, visibility, link, fileName, mime, content, by: user.id, folderId });
  if (visibility === "linked" && link) {
    await notifyUsers(await linkedUsers(link.type, link.id), { kind: "document", title: `New document shared: ${title}`, href: "/portal/vault" });
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: "document_added", detail: title });
  back("uploaded", folderId);
}

export async function remove(formData: FormData) {
  const user = await requireSection("vault");
  if (!canSeeFirmData(user.role)) back("forbidden");
  const title = await deleteDocument(String(formData.get("id") ?? ""), { id: user.id, superAdmin: user.role === "super_admin" });
  if (!title) back("forbidden", folderOf(formData));
  await audit({ actorId: user.id, actorEmail: user.email, action: "document_deleted", detail: title });
  back("deleted", folderOf(formData));
}

export async function newFolder(formData: FormData) {
  const user = await requireSection("vault");
  if (!canSeeFirmData(user.role)) back("forbidden");
  const parent = folderOf(formData);
  const r = await createFolder(String(formData.get("name") ?? ""), parent, user.id);
  back(r === "ok" ? "folder-made" : r === "exists" ? "folder-exists" : "invalid", parent);
}

export async function editFolder(formData: FormData) {
  const user = await requireSection("vault");
  if (!canSeeFirmData(user.role)) back("forbidden");
  const id = String(formData.get("id") ?? "");
  if (formData.get("op") === "delete") {
    const f = await getFolder(id);
    const r = await deleteFolder(id);
    if (r === "ok") await audit({ actorId: user.id, actorEmail: user.email, action: "folder_deleted", detail: f?.name ?? id });
    back(r === "ok" ? "folder-deleted" : r === "not-empty" ? "folder-not-empty" : "invalid", r === "ok" ? f?.parent_id : id);
  }
  const r = await renameFolder(id, String(formData.get("name") ?? ""));
  back(r === "ok" ? "folder-renamed" : r === "exists" ? "folder-exists" : "invalid", id);
}

export async function move(formData: FormData) {
  const user = await requireSection("vault");
  if (!canSeeFirmData(user.role)) back("forbidden");
  const to = String(formData.get("to") ?? "") || null;
  const ok = await moveDocument(String(formData.get("id") ?? ""), to);
  back(ok ? "moved" : "invalid", folderOf(formData));
}
