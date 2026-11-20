"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import { addNote, deleteNote, togglePin } from "@/lib/notes";

export async function createNote(formData: FormData) {
  const owner = await requireSuperAdmin();
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 8000);
  if (!title) redirect("/portal/personal?notice=invalid");
  await addNote(owner.id, title, body);
  redirect("/portal/personal?notice=added");
}

export async function pinNote(formData: FormData) {
  const owner = await requireSuperAdmin();
  await togglePin(owner.id, String(formData.get("id") ?? ""));
  redirect("/portal/personal");
}

export async function removeNote(formData: FormData) {
  const owner = await requireSuperAdmin();
  await deleteNote(owner.id, String(formData.get("id") ?? ""));
  redirect("/portal/personal?notice=removed");
}
