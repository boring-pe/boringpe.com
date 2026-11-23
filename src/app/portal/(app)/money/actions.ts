"use server";

import { isVertical } from "@/lib/ops-fields";
import { setVertical } from "@/lib/verticals";

import { redirect } from "next/navigation";
import { createApproval } from "@/lib/approvals";
import { requireSection } from "@/lib/dal";
import { listEntities } from "@/lib/books";
import { createEntry, dropEntry, getDeal, partyExists, postUnpostedMoney } from "@/lib/ops";
import { categoryLabel, inr, isCategory, oneLine, parseAmount, parseDate } from "@/lib/ops-fields";
import { paiseToDecimal, parsePaise } from "@/lib/accounting";
import { isCurrency, parseRate, rateText, toInr } from "@/lib/assets-calc";
import { emit } from "@/lib/integrations";
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
  // Amounts in another currency become rupees at the given rate; the original is kept beside them.
  const currency = String(formData.get("currency") ?? "INR");
  if (!isCurrency(currency)) back("invalid");
  let amount = parseAmount(formData.get("amount"));
  let fxAmount: string | null = null;
  let fxRate: string | null = null;
  if (currency !== "INR") {
    const rate = parseRate(String(formData.get("fxRate") ?? ""));
    const foreign = parsePaise(String(formData.get("amount") ?? ""));
    if (!rate || !foreign) back("rate");
    fxAmount = paiseToDecimal(foreign);
    fxRate = rateText(rate);
    amount = paiseToDecimal(toInr(foreign, rate));
  }
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
    id = await createEntry({ direction, category, amount, memo, dealId, partyId, status, date, by: user.id, entityId: entity.id, currency, fxAmount, fxRate });
  } catch {
    back("books-refused");
  }
  const vertical = formData.get("vertical");
  if (isVertical(vertical)) await setVertical("money_entries", id, vertical);

  if (status === "awaiting_approval") {
    const created = await createApproval({
      kind: "payment",
      title: `Pay ${inr(amount)}${fxAmount ? ` (${currency} ${fxAmount})` : ""} (${categoryLabel(category)})`,
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
  if (status !== "awaiting_approval") {
    await emit("money.recorded", { id: id!, direction, amount_inr: amount, category, memo, entity: entity.name, date, currency });
  }
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
