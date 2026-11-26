"use server";

import { redirect } from "next/navigation";
import { linkToDeal } from "@/lib/workflows";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { listEntities } from "@/lib/books";
import { addCapRow, createHolding, getHolding, recordTxn } from "@/lib/investments";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { isAssetClass, isHoldingPillar, isInstrument } from "@/lib/portfolio-calc";
import { canManagePortfolio } from "@/lib/rbac";
import { addScope, isScopeType, removeScope } from "@/lib/scopes";
import { audit } from "@/lib/users";

function back(query: string, notice: string): never {
  redirect(`/portal/portfolio?${query}${query ? "&" : ""}notice=${notice}`);
}
const today = () => new Date().toISOString().slice(0, 10);

export async function addHolding(formData: FormData) {
  const user = await requireSection("portfolio");
  if (!canManagePortfolio(user.role)) back("", "forbidden");
  const name = oneLine(formData.get("name"), 120);
  const assetClass = formData.get("assetClass");
  const pillar = formData.get("pillar");
  const holder = String(formData.get("holderEntityId") ?? "");
  const target = String(formData.get("targetEntityId") ?? "");
  const notes = oneLine(formData.get("notes"), 300);
  const entities = await listEntities();
  if (name.length < 2 || !isAssetClass(assetClass) || !isHoldingPillar(pillar) || !entities.some((e) => e.id === holder)) back("", "invalid");
  if (target && (!(await listEntities("enterable")).some((e) => e.id === target) || target === holder)) back("", "invalid");
  const id = await createHolding({
    name, holderEntityId: holder, assetClass, pillar, targetEntityId: target || null, notes, by: user.id,
  });
  const dealId = String(formData.get("dealId") ?? "");
  if (dealId) await linkToDeal("holdings", id, dealId);
  await audit({ actorId: user.id, actorEmail: user.email, action: "holding_added", detail: name });
  back(`h=${id}`, "holding-added");
}

export async function addHoldingTxn(formData: FormData) {
  const user = await requireSection("portfolio");
  const holdingId = String(formData.get("holdingId") ?? "");
  const holding = await getHolding(holdingId);
  if (!holding) back("", "invalid");
  const q = `h=${holding.id}`;
  const kind = formData.get("kind");
  if (kind !== "invest" && kind !== "income" && kind !== "exit" && kind !== "valuation") back(q, "invalid");
  // Money moving in or out of an investment is the Super Admin's decision.
  const moves = kind === "invest" || kind === "exit";
  if (moves ? user.role !== "super_admin" : !canManagePortfolio(user.role)) back(q, "forbidden");
  if (holding.status === "exited" && kind !== "income") back(q, "exited");

  const amount = parsePaise(String(formData.get("amount") ?? ""));
  const cost = parsePaise(String(formData.get("costRecovered") ?? ""));
  const sharesRaw = String(formData.get("shares") ?? "").replace(/,/g, "").trim();
  const shares = sharesRaw === "" ? null : Number(sharesRaw);
  const date = parseDate(formData.get("date")) ?? today();
  const memo = oneLine(formData.get("memo"), 200);
  if (amount === null || cost === null) back(q, "invalid");
  if ((kind === "invest" || kind === "income") && amount === 0n) back(q, "invalid");
  if (kind === "exit" && amount === 0n && cost === 0n) back(q, "invalid");
  if (shares !== null && !(Number.isFinite(shares) && shares > 0 && shares < 1e15)) back(q, "invalid");

  let result;
  try {
    result = await recordTxn({
      holdingId: holding.id, kind, date, amount, costRecovered: kind === "exit" ? cost : 0n, memo,
      shares: kind === "invest" ? shares : null, markExited: formData.get("markExited") === "on", by: user.id,
    });
  } catch {
    back(q, "books-refused");
  }
  if (result === "too-much-cost" || result === "cost-left") back(q, result);
  if (result !== "ok") back("", "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: `holding_${kind}`, detail: `${holding.name}${memo ? `: ${memo}` : ""}` });
  back(q, `txn-${kind}`);
}

export async function addCap(formData: FormData) {
  const user = await requireSection("portfolio");
  const entityId = String(formData.get("entityId") ?? "");
  const q = `view=cap&e=${encodeURIComponent(entityId)}`;
  if (!canManagePortfolio(user.role)) back(q, "forbidden");
  if (!(await listEntities()).some((e) => e.id === entityId)) back("view=cap", "invalid");
  const holderName = oneLine(formData.get("holderName"), 120);
  const instrument = formData.get("instrument");
  const sharesRaw = String(formData.get("shares") ?? "").replace(/,/g, "").trim();
  const shares = Number(sharesRaw);
  const invested = parsePaise(String(formData.get("invested") ?? ""));
  const issuedOn = parseDate(formData.get("issuedOn")) ?? today();
  const notes = oneLine(formData.get("notes"), 200);
  if (holderName.length < 2 || !isInstrument(instrument) || !/^\d+(\.\d{1,4})?$/.test(sharesRaw) || !(shares > 0) || invested === null) {
    back(q, "invalid");
  }
  await addCapRow({ entityId, holderName, instrument, shares: sharesRaw, invested, issuedOn, notes, by: user.id });
  await audit({ actorId: user.id, actorEmail: user.email, action: "cap_row_added", detail: `${holderName}: ${sharesRaw}` });
  back(q, "cap-added");
}

/** Links an external person (LP, founder, operator, Co-Build partner) to one SPV, venture or holding. */
export async function addAccess(formData: FormData) {
  const user = await requireSection("portfolio");
  if (!canManagePortfolio(user.role)) back("view=access", "forbidden");
  const userId = String(formData.get("userId") ?? "");
  const [type, refId] = String(formData.get("item") ?? "").split(":");
  if (!isScopeType(type) || !refId || !(await addScope(userId, type, refId, user.id))) back("view=access", "access-invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "access_linked", detail: `${type} ${refId}` });
  back("view=access", "access-added");
}

export async function dropAccess(formData: FormData) {
  const user = await requireSection("portfolio");
  if (!canManagePortfolio(user.role)) back("view=access", "forbidden");
  if (!(await removeScope(String(formData.get("scopeId") ?? "")))) back("view=access", "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "access_unlinked" });
  back("view=access", "access-removed");
}
