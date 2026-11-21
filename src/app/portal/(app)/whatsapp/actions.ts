"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { oneLine } from "@/lib/ops-fields";
import { canSeeFirmData } from "@/lib/rbac";
import { audit, listUsers } from "@/lib/users";
import { assign, rename, sendTemplate, sendText, templates } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/whatsapp-calc";

const back = (waId: string, notice: string): never => redirect(`/portal/whatsapp?c=${encodeURIComponent(waId)}&notice=${notice}`);

export async function reply(formData: FormData) {
  const user = await requireSection("whatsapp");
  const waId = normalizePhone(String(formData.get("waId") ?? ""));
  const text = String(formData.get("text") ?? "").trim().slice(0, 4096);
  if (!waId || !text) redirect("/portal/whatsapp?notice=invalid");
  const error = await sendText(waId, text, user.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: error ? "whatsapp_failed" : "whatsapp_sent", detail: `+${waId}` });
  back(waId, error ? (/24 hours/.test(error) ? "window" : "failed") : "sent");
}

/** Sends an approved template: starts a conversation, or reopens one after 24 hours. */
export async function template(formData: FormData) {
  const user = await requireSection("whatsapp");
  const waId = normalizePhone(String(formData.get("waId") ?? ""));
  const [name, language] = String(formData.get("template") ?? "").split("|");
  const list = await templates();
  const t = list.find((x) => x.name === name && x.language === language);
  if (!waId || !t) redirect(`/portal/whatsapp?notice=invalid${waId ? `&c=${waId}` : ""}`);
  const params = Array.from({ length: t.params }, (_, i) => oneLine(formData.get(`p${i + 1}`), 300));
  if (params.some((p) => !p)) back(waId, "params");
  const error = await sendTemplate(waId, t.name, t.language, params, user.id);
  const contactName = oneLine(formData.get("name"), 120);
  if (contactName) await rename(waId, contactName);
  await audit({ actorId: user.id, actorEmail: user.email, action: error ? "whatsapp_failed" : "whatsapp_template", detail: `+${waId} ${t.name}` });
  back(waId, error ? "failed" : "sent");
}

export async function setOwner(formData: FormData) {
  const user = await requireSection("whatsapp");
  const waId = normalizePhone(String(formData.get("waId") ?? ""));
  const to = String(formData.get("userId") ?? "");
  if (!waId) redirect("/portal/whatsapp?notice=invalid");
  if (to && !(await listUsers()).some((u) => u.id === to && u.status === "active" && canSeeFirmData(u.role))) back(waId, "invalid");
  await assign(waId, to || null);
  await audit({ actorId: user.id, actorEmail: user.email, action: "whatsapp_assigned", detail: `+${waId}` });
  back(waId, "assigned");
}
