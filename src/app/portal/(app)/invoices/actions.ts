"use server";

import { isVertical } from "@/lib/ops-fields";
import { linkInvoiceDeal } from "@/lib/workflows";
import { setVertical } from "@/lib/verticals";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { GST_RATES, isStateCode, parseQty, validGstin } from "@/lib/invoice-calc";
import { isCurrency, parseRate } from "@/lib/assets-calc";
import {
  INCOME_ACCOUNTS, cancelInvoice, createInvoice, deleteDraft, getInvoice, gstProfiles, issueInvoice, listPartiesGst, recordReceipt,
  settleIntercompany, updateEntityGst, updatePartyGst,
} from "@/lib/invoices";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { canPostBooks } from "@/lib/rbac";
import { emit, logEvent } from "@/lib/integrations";
import { createPaymentLink } from "@/lib/payments";
import { audit } from "@/lib/users";

const ROWS = 5;
const today = () => new Date().toISOString().slice(0, 10);
function back(query: string, notice: string): never {
  redirect(`/portal/invoices?${query}${query ? "&" : ""}notice=${notice}`);
}
async function poster() {
  const user = await requireSection("invoices");
  if (!canPostBooks(user.role)) back("", "forbidden");
  return user;
}

export async function newInvoice(formData: FormData) {
  const user = await poster();
  const entityId = String(formData.get("entityId") ?? "");
  const partyId = String(formData.get("partyId") ?? "");
  const issueDate = parseDate(formData.get("issueDate")) ?? today();
  const dueDate = parseDate(formData.get("dueDate")) ?? issueDate;
  const place = String(formData.get("placeOfSupply") ?? "");
  const incomeCode = String(formData.get("incomeCode") ?? "");
  const [profiles, parties] = await Promise.all([gstProfiles(), listPartiesGst()]);
  if (!profiles.some((e) => e.id === entityId) || !parties.some((p) => p.id === partyId)) back("view=new", "invalid");
  if (!isStateCode(place) || !INCOME_ACCOUNTS.some((a) => a.code === incomeCode) || dueDate < issueDate) back("view=new", "invalid");
  const lines = [];
  for (let i = 0; i < ROWS; i++) {
    const description = oneLine(formData.get(`desc${i}`), 200);
    const rateRaw = String(formData.get(`rate${i}`) ?? "");
    if (!description && !rateRaw.trim()) continue;
    const qtyMilli = parseQty(String(formData.get(`qty${i}`) ?? ""));
    const rate = parsePaise(rateRaw);
    const gstBps = Number(formData.get(`gst${i}`));
    if (!description || qtyMilli === null || !rate || !(GST_RATES as readonly number[]).includes(gstBps)) back("view=new", "lines");
    lines.push({ description, sac: oneLine(formData.get(`sac${i}`), 10), qtyMilli, rate, gstBps });
  }
  if (lines.length === 0) back("view=new", "lines");
  const currency = String(formData.get("currency") ?? "INR");
  if (!isCurrency(currency)) back("view=new", "invalid");
  const fxRate = currency === "INR" ? null : parseRate(String(formData.get("fxRate") ?? ""));
  if (currency !== "INR" && !fxRate) back("view=new", "rate");
  const id = await createInvoice({
    entityId, partyId, issueDate, dueDate, placeOfSupply: place, incomeCode, notes: oneLine(formData.get("notes"), 500), lines, by: user.id,
    currency, fxRate,
  });
  const vertical = formData.get("vertical");
  if (isVertical(vertical)) await setVertical("invoices", id, vertical);
  // Raised from a deal's page: tie it to the deal so the deal's workflow can follow it.
  const dealId = String(formData.get("dealId") ?? "");
  if (dealId) await linkInvoiceDeal(id, dealId);
  await audit({ actorId: user.id, actorEmail: user.email, action: "invoice_drafted", detail: id });
  back(`inv=${id}`, "drafted");
}

export async function invoiceAction(formData: FormData) {
  const user = await requireSection("invoices");
  const id = String(formData.get("id") ?? "");
  const q = `inv=${encodeURIComponent(id)}`;
  const what = formData.get("what");
  const date = parseDate(formData.get("date")) ?? today();
  // Permission and input checks first: redirects must not happen inside the try below.
  if ((what === "issue" || what === "delete" || what === "receipt") && !canPostBooks(user.role)) back(q, "forbidden");
  if ((what === "cancel" || what === "settle") && user.role !== "super_admin") back(q, "forbidden");
  const amount = parsePaise(String(formData.get("amount") ?? ""));
  const tds = parsePaise(String(formData.get("tds") ?? ""));
  const fxRaw = String(formData.get("fxSettled") ?? "").trim();
  const fxSettled = fxRaw ? parsePaise(fxRaw) : null;
  if (what === "receipt" && (amount === null || tds === null || amount + tds === 0n || (fxRaw && fxSettled === null))) back(q, "invalid");

  let outcome: string;
  try {
    if (what === "issue") outcome = (await issueInvoice(id, user.id)) ? "ok" : "invalid";
    else if (what === "delete") outcome = (await deleteDraft(id)) ? "deleted" : "invalid";
    else if (what === "receipt") outcome = await recordReceipt(id, { date, amount: amount!, tds: tds!, by: user.id, fxSettled });
    else if (what === "cancel") outcome = (await cancelInvoice(id, date, user.id)) ? "ok" : "invalid";
    else if (what === "settle") outcome = (await settleIntercompany(id, date, user.id)) ? "ok" : "invalid";
    else outcome = "invalid";
  } catch {
    outcome = "books-refused";
  }
  if (outcome === "deleted") back("", "deleted");
  if (outcome !== "ok") back(q, outcome);
  await audit({ actorId: user.id, actorEmail: user.email, action: `invoice_${String(what)}`, detail: id });
  if (what === "issue" || what === "receipt" || what === "settle") {
    const inv = await getInvoice(id);
    if (inv && (what === "issue" || inv.status === "paid")) {
      await emit(what === "issue" ? "invoice.issued" : "invoice.paid", {
        id: inv.id, number: inv.number, entity: inv.entity_name, customer: inv.party_name, total_inr: inv.total, currency: inv.currency, status: inv.status,
      });
    }
  }
  back(q, `done-${String(what)}`);
}

function gstFields(formData: FormData) {
  const gstinRaw = oneLine(formData.get("gstin"), 15).toUpperCase();
  const stateRaw = String(formData.get("stateCode") ?? "");
  if (gstinRaw && !validGstin(gstinRaw)) return null;
  const stateCode = gstinRaw ? gstinRaw.slice(0, 2) : stateRaw || null;
  if (stateCode && !isStateCode(stateCode)) return null;
  return { gstin: gstinRaw || null, stateCode, address: oneLine(formData.get("address"), 300) };
}

export async function saveEntityGst(formData: FormData) {
  const user = await poster();
  const id = String(formData.get("entityId") ?? "");
  const f = gstFields(formData);
  const prefix = oneLine(formData.get("prefix"), 10).toUpperCase() || "INV";
  if (!f || !/^[A-Z0-9-]{1,10}$/.test(prefix) || !(await gstProfiles()).some((e) => e.id === id)) back("view=settings", "gstin");
  await updateEntityGst(id, { ...f, prefix });
  await audit({ actorId: user.id, actorEmail: user.email, action: "entity_gst_saved", detail: id });
  back("view=settings", "saved");
}

export async function savePartyGst(formData: FormData) {
  const user = await poster();
  const f = gstFields(formData);
  if (!f || !(await updatePartyGst(String(formData.get("partyId") ?? ""), f))) back("view=settings", "gstin");
  await audit({ actorId: user.id, actorEmail: user.email, action: "party_gst_saved" });
  back("view=settings", "saved");
}

/** A Razorpay payment link for what is still owed. */
export async function paymentLink(formData: FormData) {
  const user = await requireSection("invoices");
  const id = String(formData.get("id") ?? "");
  const q = `inv=${encodeURIComponent(id)}`;
  if (!canPostBooks(user.role)) back(q, "forbidden");
  const r = await createPaymentLink(id, user.id);
  if ("error" in r) {
    await logEvent("razorpay", "payment_link", false, r.error, user.email);
    back(q, "paylink-failed");
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: "payment_link_created", detail: id });
  back(q, "paylink");
}
