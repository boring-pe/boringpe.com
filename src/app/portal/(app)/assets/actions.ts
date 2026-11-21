"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { ASSET_CATEGORIES, isAssetCategory } from "@/lib/assets-calc";
import { addAsset, disposeAsset, runDepreciation } from "@/lib/assets";
import { listEntities } from "@/lib/books";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { canPostBooks } from "@/lib/rbac";
import { audit } from "@/lib/users";
import { parseMonth, parsePercent } from "@/lib/venture-calc";

function back(entity: string, notice: string): never {
  redirect(`/portal/assets?e=${encodeURIComponent(entity)}&notice=${notice}`);
}
async function poster(entityId: string) {
  const user = await requireSection("assets");
  if (!canPostBooks(user.role)) back(entityId, "forbidden");
  if (!(await listEntities()).some((e) => e.id === entityId)) redirect("/portal/assets?notice=invalid");
  return user;
}

export async function newAsset(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const user = await poster(entityId);
  const name = oneLine(formData.get("name"), 120);
  const category = formData.get("category");
  const purchaseDate = parseDate(formData.get("purchaseDate"));
  const cost = parsePaise(String(formData.get("cost") ?? ""));
  const salvage = parsePaise(String(formData.get("salvage") ?? ""));
  const method = formData.get("method");
  const defaults = ASSET_CATEGORIES.find((c) => c.id === category);
  const lifeRaw = String(formData.get("lifeMonths") ?? "").trim();
  const lifeMonths = lifeRaw ? Number(lifeRaw) : defaults?.lifeMonths ?? 0;
  const wdvRaw = String(formData.get("wdvPercent") ?? "").trim();
  const wdvBps = wdvRaw ? parsePercent(wdvRaw) : defaults?.wdvBps ?? null;
  if (name.length < 2 || !isAssetCategory(category) || !purchaseDate || !cost || salvage === null || salvage >= cost) back(entityId, "invalid");
  if (method !== "slm" && method !== "wdv") back(entityId, "invalid");
  if (method === "slm" && !(Number.isInteger(lifeMonths) && lifeMonths >= 1 && lifeMonths <= 600)) back(entityId, "invalid");
  if (method === "wdv" && !wdvBps) back(entityId, "invalid");
  let ok = true;
  try {
    await addAsset({
      entityId, name, category, purchaseDate, cost, salvage, method, lifeMonths: method === "slm" ? lifeMonths : 0,
      wdvBps: method === "wdv" ? wdvBps! : 0, paid: formData.get("paid") !== "credit", by: user.id,
    });
  } catch {
    ok = false;
  }
  if (!ok) back(entityId, "books-refused");
  await audit({ actorId: user.id, actorEmail: user.email, action: "asset_added", detail: name });
  back(entityId, "added");
}

export async function depreciate(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const user = await poster(entityId);
  const period = parseMonth(formData.get("month"));
  if (!period) back(entityId, "invalid");
  let result: string;
  try {
    result = await runDepreciation(entityId, period, user.id);
  } catch {
    result = "books-refused";
  }
  if (result !== "ok") back(entityId, `run-${result}`);
  await audit({ actorId: user.id, actorEmail: user.email, action: "depreciation_run", detail: period.slice(0, 7) });
  back(entityId, "run-ok");
}

export async function dispose(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const user = await poster(entityId);
  const date = parseDate(formData.get("date")) ?? new Date().toISOString().slice(0, 10);
  const proceeds = parsePaise(String(formData.get("proceeds") ?? ""));
  if (proceeds === null) back(entityId, "invalid");
  let ok = false;
  try {
    ok = await disposeAsset(String(formData.get("assetId") ?? ""), date, proceeds, user.id);
  } catch {
    ok = false;
  }
  if (!ok) back(entityId, "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "asset_disposed" });
  back(entityId, "disposed");
}
