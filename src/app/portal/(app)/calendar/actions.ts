"use server";

import { redirect } from "next/navigation";
import { createMeeting, isLinkType, linkTargets } from "@/lib/calendar";
import { requireSection } from "@/lib/dal";
import { oneLine } from "@/lib/ops-fields";
import { canSeeFirmData } from "@/lib/rbac";
import { audit } from "@/lib/users";

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

export async function newMeeting(formData: FormData) {
  const user = await requireSection("calendar");
  const title = oneLine(formData.get("title"), 200);
  const startLocal = String(formData.get("start") ?? "");
  const endLocal = String(formData.get("end") ?? "");
  const attendees = String(formData.get("attendees") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (title.length < 2 || !LOCAL.test(startLocal) || !LOCAL.test(endLocal) || endLocal <= startLocal || attendees.length > 50 || attendees.some((a) => !EMAIL.test(a))) {
    redirect("/portal/calendar?notice=invalid");
  }
  let link: { type: "deal" | "venture" | "party" | "employee"; id: string } | null = null;
  const [type, id] = String(formData.get("link") ?? "").split(":");
  if (type) {
    // Linking to records is for the Boring PE team, and only to records that exist.
    if (!canSeeFirmData(user.role) || !isLinkType(type) || !(await linkTargets()).some((t) => t.type === type && t.id === id)) redirect("/portal/calendar?notice=invalid");
    link = { type, id };
  }
  let ok = true;
  try {
    await createMeeting(user.id, String(formData.get("accountId") ?? ""), {
      title, description: String(formData.get("description") ?? "").slice(0, 5000), startLocal, endLocal, attendees, online: formData.get("online") === "on",
    }, link);
  } catch (err) {
    ok = false;
    console.error("[calendar]", (err as Error).message);
  }
  if (!ok) redirect("/portal/calendar?notice=failed");
  await audit({ actorId: user.id, actorEmail: user.email, action: "meeting_created", detail: title });
  redirect("/portal/calendar?notice=created");
}
