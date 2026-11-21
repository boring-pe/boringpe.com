"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { listEntities } from "@/lib/books";
import { budgetFromLastYear, setAnnualBudget } from "@/lib/budgets";
import { canPostBooks } from "@/lib/rbac";
import { audit } from "@/lib/users";

function back(entity: string, fy: number, notice: string): never {
  redirect(`/portal/budgets?e=${encodeURIComponent(entity)}&fy=${fy}&notice=${notice}`);
}

async function guard(formData: FormData) {
  const user = await requireSection("budgets");
  const entityId = String(formData.get("entityId") ?? "");
  const fy = Number(formData.get("fy"));
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) redirect("/portal/budgets?notice=invalid");
  if (!canPostBooks(user.role)) back(entityId, fy, "forbidden");
  if (!(await listEntities()).some((e) => e.id === entityId)) redirect("/portal/budgets?notice=invalid");
  return { user, entityId, fy };
}

export async function saveBudget(formData: FormData) {
  const { user, entityId, fy } = await guard(formData);
  const annual = parsePaise(String(formData.get("annual") ?? ""));
  if (annual === null || !(await setAnnualBudget(entityId, String(formData.get("accountId") ?? ""), fy, annual, user.id))) back(entityId, fy, "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "budget_set", detail: `${fy}` });
  back(entityId, fy, "saved");
}

export async function copyLastYear(formData: FormData) {
  const { user, entityId, fy } = await guard(formData);
  const n = await budgetFromLastYear(entityId, fy, user.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: "budget_copied", detail: `${fy}: ${n}` });
  back(entityId, fy, n ? "copied" : "nothing");
}
