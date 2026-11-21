"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { markAllRead, setEmailPreference } from "@/lib/notify";

export async function readAll() {
  const user = await requireUser();
  await markAllRead(user.id);
  redirect("/portal/notifications");
}

export async function emailPref(formData: FormData) {
  const user = await requireUser();
  await setEmailPreference(user.id, formData.get("on") === "true");
  redirect("/portal/notifications?saved=1");
}
