"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { importStatement, matchLine, postLine, rematch, setIgnored, unmatch } from "@/lib/bank";
import { listAccounts, listEntities } from "@/lib/books";
import { canPostBooks } from "@/lib/rbac";
import { audit } from "@/lib/users";

const MAX_CSV = 2 * 1024 * 1024;
function back(entity: string, notice: string, extra = ""): never {
  redirect(`/portal/bank?e=${encodeURIComponent(entity)}&notice=${notice}${extra}`);
}
async function poster(entityId: string) {
  const user = await requireSection("bank");
  if (!canPostBooks(user.role)) back(entityId, "forbidden");
  if (!(await listEntities()).some((e) => e.id === entityId)) redirect("/portal/bank?notice=invalid");
  return user;
}

export async function upload(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const user = await poster(entityId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(entityId, "no-file");
  if (file.size > MAX_CSV || !/\.csv$/i.test(file.name)) back(entityId, "csv");
  const result = await importStatement(entityId, file.name.slice(0, 120), await file.text(), user.id);
  if ("error" in result) back(entityId, "unreadable");
  await audit({ actorId: user.id, actorEmail: user.email, action: "bank_imported", detail: `${file.name}: ${result.added} new` });
  back(entityId, "imported", `&added=${result.added}&dup=${result.duplicates}&skip=${result.skipped}&matched=${result.matched}`);
}

export async function lineAction(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const user = await poster(entityId);
  const id = String(formData.get("lineId") ?? "");
  const what = formData.get("what");
  let ok = false;
  if (what === "rematch") {
    const n = await rematch(entityId, user.id);
    back(entityId, "rematched", `&matched=${n}`);
  }
  if (what === "match") ok = await matchLine(id, String(formData.get("journalLineId") ?? ""), user.id);
  else if (what === "post") {
    const code = String(formData.get("counterCode") ?? "");
    const valid = (await listAccounts(entityId)).some((a) => a.active && a.code === code && code !== "1010");
    if (!valid) back(entityId, "invalid");
    let posted = false;
    try {
      posted = await postLine(id, code, user.id);
    } catch {
      posted = false;
    }
    ok = posted;
  } else if (what === "ignore") ok = await setIgnored(id, true, user.id);
  else if (what === "restore") ok = await setIgnored(id, false, user.id);
  else if (what === "unmatch") ok = await unmatch(id, user.id);
  if (!ok) back(entityId, "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: `bank_${String(what)}`, detail: id });
  back(entityId, `done-${String(what)}`);
}
