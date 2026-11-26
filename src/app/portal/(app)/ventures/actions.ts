"use server";

import { redirect } from "next/navigation";
import { linkToDeal } from "@/lib/workflows";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { listEntities } from "@/lib/books";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { canManagePortfolio, canPostBooks } from "@/lib/rbac";
import { audit } from "@/lib/users";
import { parseMonth, parsePercent } from "@/lib/venture-calc";
import { addOperator, closePeriod, createVenture, getVenture, operatorUsers, payoutUser, payPayout, ventureUsers } from "@/lib/ventures";
import { notifyUsers } from "@/lib/notify";

function back(query: string, notice: string): never {
  redirect(`/portal/ventures?${query}${query ? "&" : ""}notice=${notice}`);
}

export async function addVenture(formData: FormData) {
  const user = await requireSection("ventures");
  if (!canManagePortfolio(user.role)) back("", "forbidden");
  const name = oneLine(formData.get("name"), 120);
  const pillar = formData.get("pillar");
  const entityId = String(formData.get("entityId") ?? "");
  const feeType = formData.get("feeType");
  const fixed = parsePaise(String(formData.get("feeFixed") ?? ""));
  const bps = parsePercent(String(formData.get("feePercent") ?? "") || "0");
  const notes = oneLine(formData.get("notes"), 300);
  if (name.length < 2 || (pillar !== "build" && pillar !== "co_build")) back("", "invalid");
  if (feeType !== "none" && feeType !== "fixed" && feeType !== "percent") back("", "invalid");
  if (fixed === null || bps === null) back("", "invalid");
  if ((feeType === "fixed" && fixed === 0n) || (feeType === "percent" && bps === 0)) back("", "fee");
  if (!(await listEntities()).some((e) => e.id === entityId)) back("", "invalid");
  const id = await createVenture({
    name, pillar, entityId, notes, by: user.id,
    fee: { type: feeType, fixed: feeType === "fixed" ? fixed : 0n, bps: feeType === "percent" ? bps : 0 },
  });
  if (id === "exists") back("", "exists");
  const dealId = String(formData.get("dealId") ?? "");
  if (dealId) await linkToDeal("ventures", id, dealId);
  await audit({ actorId: user.id, actorEmail: user.email, action: "venture_added", detail: name });
  back(`v=${id}`, "venture-added");
}

export async function addVentureOperator(formData: FormData) {
  const user = await requireSection("ventures");
  const venture = await getVenture(String(formData.get("ventureId") ?? ""));
  if (!venture) back("", "invalid");
  const q = `v=${venture.id}`;
  if (!canManagePortfolio(user.role)) back(q, "forbidden");
  const name = oneLine(formData.get("name"), 120);
  const basis = formData.get("basis");
  const bps = parsePercent(String(formData.get("percent") ?? ""));
  const userId = String(formData.get("userId") ?? "");
  if (name.length < 2 || (basis !== "revenue" && basis !== "profit") || !bps) back(q, "invalid");
  if (userId && !(await operatorUsers()).some((u) => u.id === userId)) back(q, "invalid");
  const result = await addOperator({ ventureId: venture.id, name, userId: userId || null, basis, bps });
  if (result === "over-100") back(q, "over-100");
  await audit({ actorId: user.id, actorEmail: user.email, action: "operator_added", detail: `${venture.name}: ${name}` });
  back(q, "operator-added");
}

export async function closeVenturePeriod(formData: FormData) {
  const user = await requireSection("ventures");
  const venture = await getVenture(String(formData.get("ventureId") ?? ""));
  if (!venture) back("", "invalid");
  const q = `v=${venture.id}`;
  if (!canPostBooks(user.role)) back(q, "forbidden");
  const period = parseMonth(formData.get("month"));
  const revenue = parsePaise(String(formData.get("revenue") ?? ""));
  const costs = parsePaise(String(formData.get("costs") ?? ""));
  if (!period || revenue === null || costs === null || (revenue === 0n && costs === 0n)) back(q, "invalid");
  let result;
  try {
    result = await closePeriod({ ventureId: venture.id, period, revenue, costs, by: user.id });
  } catch {
    back(q, "books-refused");
  }
  if (result === "exists") back(q, "period-exists");
  if (result !== "ok") back(q, "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "venture_period_closed", detail: `${venture.name} ${period.slice(0, 7)}` });
  await notifyUsers(await ventureUsers(venture.id), {
    kind: "venture", title: `Statement ready: ${venture.name} ${period.slice(0, 7)}`, href: `/portal/ventures?v=${venture.id}`,
  });
  back(q, "closed");
}

/** Paying operators moves money, so it is the Super Admin's. */
export async function payOperator(formData: FormData) {
  const user = await requireSection("ventures");
  const ventureId = String(formData.get("ventureId") ?? "");
  const q = `v=${encodeURIComponent(ventureId)}`;
  if (user.role !== "super_admin") back(q, "forbidden");
  const date = parseDate(formData.get("date")) ?? new Date().toISOString().slice(0, 10);
  let ok = false;
  try {
    ok = await payPayout(String(formData.get("payoutId") ?? ""), date, user.id);
  } catch {
    back(q, "books-refused");
  }
  if (!ok) back(q, "already-paid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "operator_paid", detail: ventureId });
  const paid = await payoutUser(String(formData.get("payoutId") ?? ""));
  await notifyUsers([paid?.user_id], {
    kind: "venture", title: `Your share was paid: ${paid?.venture ?? ""} ${paid?.period ?? ""}`, href: `/portal/ventures?v=${encodeURIComponent(ventureId)}`,
  });
  back(q, "paid");
}
