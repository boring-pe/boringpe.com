"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { updatePrefs } from "@/lib/prefs";
import { ACCENTS, DENSITIES, THEMES, type Prefs } from "@/lib/prefs-fields";
import { allowedSections } from "@/lib/rbac";

export async function setTheme(theme: string) {
  const user = await requireUser();
  if (!(THEMES as readonly string[]).includes(theme)) return;
  await updatePrefs(user.id, { theme: theme as Prefs["theme"] });
  revalidatePath("/portal", "layout");
}

export async function saveAppearance(formData: FormData) {
  const user = await requireUser();
  const change: Partial<Prefs> = {};
  const theme = String(formData.get("theme") ?? "");
  const accent = String(formData.get("accent") ?? "");
  const density = String(formData.get("density") ?? "");
  if ((THEMES as readonly string[]).includes(theme)) change.theme = theme as Prefs["theme"];
  if (ACCENTS.some((a) => a.id === accent)) change.accent = accent as Prefs["accent"];
  if ((DENSITIES as readonly string[]).includes(density)) change.density = density as Prefs["density"];
  await updatePrefs(user.id, change);
  revalidatePath("/portal", "layout");
}

/** Pins or unpins a page in the person's sidebar; only pages they can open. */
export async function togglePin(section: string) {
  const user = await requireUser();
  if (!allowedSections(user.role).some((s) => s.id === section)) return;
  const { getPrefs } = await import("@/lib/prefs");
  const current = await getPrefs(user.id);
  const pinned = current.pinned.includes(section) ? current.pinned.filter((p) => p !== section) : [...current.pinned, section];
  await updatePrefs(user.id, { pinned });
  revalidatePath("/portal", "layout");
}
