"use server";

import { redirect } from "next/navigation";
import { createApproval } from "@/lib/approvals";
import { requireSection } from "@/lib/dal";
import { listEntities } from "@/lib/books";
import { createEntry, dropEntry, getDeal, partyExists, postUnpostedMoney } from "@/lib/ops";
import { categoryLabel, inr, isCategory, oneLine, parseAmount, parseDate } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

function back(notice: string): never {
  redirect(`/portal/money?notice=${notice}`);
}

/**
 * Money in is a record of something that happened. Money out is a payment: only the Super Admin
 * can create one directly, and everyone else's waits for approval before it counts.
 */
export async function addEntry(formData: FormData) {
  const user = await requireSection("money");
  const direction = formData.get("direction");
  const category = formData.get("category");
  const amount = parseAmount(formData.get("amount"));
  const date = parseDate(formData.get("date")) ?? new Date().toISOString().slice(0, 10);
  const memo = oneLine(formData.get("memo"), 300);
  const dealRaw = String(formData.get("dealId") ?? "");
  const partyRaw = String(formData.get("partyId") ?? "");
  if ((direction !== "in" && direction !== "out") || !isCategory(category) || !amount) back("invalid");
  const entities = await listEntities();
  const entityRaw = String(formData.get("entityId") ?? "");
  const entity = entities.find((x) => x.id === entityRaw) ?? (entityRaw ? undefined : entities.find((x) => x.kind === "boring_pe"));
  if (!entity) back("invalid");
  if (direction === "out" && memo.length < 3) back("memo");

  let dealId: string | null = null;
  if (dealRaw) {
    if (!(await getDeal(dealRaw))) back("invalid");
    dealId = dealRaw;
  }
  let partyId: string | null = null;
  if (partyRaw) {
    if (!(await partyExists(partyRaw))) back("invalid");
    partyId = partyRaw;
  }

  const owner = user.role === "super_admin";
  const status = direction === "in" ? "recorded" : owner ? "approved" : "awaiting_approval";
  let id: string;
  try {
    id = await createEntry({ direction, category, amount, memo, dealId, partyId, status, date, by: user.id, entityId: entity.id });
  } catch {
    back("books-refused");
  }

  if (status === "awaiting_approval") {
    const created = await createApproval({
      kind: "payment",
      title: `Pay ${inr(amount)} (${categoryLabel(category)})`,
      detail: memo,
      requestedBy: user.id,
      requestedByEmail: user.email,
      refType: "money_entry",
      refId: id,
    });
    if (created === "too-many") {
      await dropEntry(id);
      back("too-many");
    }
  }
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: `money_${direction}_${status}`,
    detail: `${inr(amount)} ${categoryLabel(category)}${memo ? `: ${memo}` : ""}`,
  });
  back(status === "awaiting_approval" ? "requested" : "saved");
}

/** Posts entries recorded before Money was connected to the books. Super Admin only. */
export async function postOlderEntries() {
  const user = await requireSection("money");
  if (user.role !== "super_admin") back("invalid");
  const n = await postUnpostedMoney(user.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: "money_backfilled", detail: `${n} entries` });
  back("backfilled");
}
