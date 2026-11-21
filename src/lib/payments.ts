import { randomUUID } from "node:crypto";
import { getSql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, postByCodes } from "./books";
import { credentials, emit, logEvent } from "./integrations";
import { getInvoice, recordReceipt } from "./invoices";
import { notifyUsers } from "./notify";
import { linkReference, parsePaidLink, validRazorpaySignature } from "./razorpay-calc";
import { testMode } from "./test-mode";

export async function linksFor(invoiceId: string) {
  const sql = await getSql();
  return sql.query<{ id: string; amount: string; short_url: string; status: string; created_at: string }>(
    "select id, amount::text, short_url, status, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at from payment_links where invoice_id = $1 order by created_at desc",
    [invoiceId],
  );
}

export const razorpayReady = async () => testMode() || Boolean((await credentials("razorpay"))?.keySecret);

/** A Razorpay payment link for what is still owed on an issued rupee invoice. */
export async function createPaymentLink(invoiceId: string, by: string): Promise<{ url: string } | { error: string }> {
  const inv = await getInvoice(invoiceId);
  if (!inv || inv.status !== "issued" || inv.currency !== "INR") return { error: "Only issued invoices in rupees can have a payment link." };
  const due = decimalToPaise(inv.total) - decimalToPaise(inv.received) - decimalToPaise(inv.tds);
  if (due < 100n) return { error: "Nothing left to collect." };
  const existing = await linksFor(invoiceId);
  const live = existing.find((l) => l.status === "created" && decimalToPaise(l.amount) === due);
  if (live) return { url: live.short_url };
  let id: string, url: string;
  if (testMode()) {
    id = `plink_test_${randomUUID().slice(0, 12)}`;
    url = `https://rzp.io/test/${id}`;
  } else {
    const c = await credentials("razorpay");
    if (!c?.keyId || !c.keySecret) return { error: "Razorpay is not connected under Integrations." };
    try {
      const res = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(due), currency: "INR", accept_partial: false, reference_id: linkReference(inv.number ?? inv.id, existing.length),
          description: `Invoice ${inv.number} from ${inv.entity_name}`.slice(0, 2048),
          customer: { name: inv.buyer.name.slice(0, 100), ...(inv.buyer.email ? { email: inv.buyer.email } : {}) },
          notify: { sms: false, email: Boolean(inv.buyer.email) }, reminder_enable: true, notes: { invoice_id: inv.id },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const j = (await res.json()) as { id?: string; short_url?: string; error?: { description?: string } };
      if (!res.ok || !j.id || !j.short_url) return { error: j.error?.description ?? `Razorpay said ${res.status}` };
      id = j.id;
      url = j.short_url;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
  const sql = await getSql();
  await sql.query("insert into payment_links (id, invoice_id, amount, short_url, created_by) values ($1, $2, $3, $4, $5)", [id, invoiceId, paiseToDecimal(due), url, by]);
  return { url };
}

/**
 * A Razorpay webhook: checked against the webhook secret, handled once per event id. A paid link
 * records the receipt into the payment gateway account and books Razorpay's fee and its GST.
 */
export async function handleRazorpay(raw: string, signature: string | null, eventId: string | null): Promise<"ok" | "unauthorized" | "not-configured"> {
  const c = await credentials("razorpay");
  const secret = c?.webhookSecret;
  if (!secret) return "not-configured";
  if (!validRazorpaySignature(raw, signature, secret)) return "unauthorized";
  const sql = await getSql();
  if (eventId) {
    const fresh = await sql.query("insert into razorpay_events (event_id) values ($1) on conflict do nothing returning event_id", [eventId.slice(0, 100)]);
    if (!fresh.length) return "ok";
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return "ok";
  }
  const paid = parsePaidLink(payload);
  if (!paid) return "ok";
  const link = (await sql.query<{ invoice_id: string; created_by: string | null; razorpay_payment_id: string | null }>(
    "select invoice_id, created_by, razorpay_payment_id from payment_links where id = $1",
    [paid.linkId],
  ))[0];
  if (!link || link.razorpay_payment_id) return "ok";
  const inv = await getInvoice(link.invoice_id);
  if (!inv) return "ok";
  const today = new Date().toISOString().slice(0, 10);
  const by = link.created_by ?? "";
  const result = await recordReceipt(inv.id, { date: today, amount: paid.amountPaise, tds: 0n, by, bankCode: "1030" });
  if (result !== "ok") {
    await logEvent("razorpay", "payment", false, `${paid.paymentId} for ${inv.number}: ${result}`, null);
    return "ok";
  }
  if (paid.feePaise > 0n) {
    await sql.tx((db) => postByCodes(db, {
      entityId: inv.entity_id, date: today, by, sourceType: "razorpay_fee", sourceId: paid.paymentId, memo: `Razorpay fee on ${inv.number}`,
      lines: [
        { code: "5070", debit: paid.feePaise - paid.taxPaise, credit: 0n }, { code: "1400", debit: paid.taxPaise, credit: 0n },
        { code: "1030", debit: 0n, credit: paid.feePaise },
      ],
    }));
  }
  await sql.query("update payment_links set status = 'paid', razorpay_payment_id = $2 where id = $1", [paid.linkId, paid.paymentId]);
  await logEvent("razorpay", "payment", true, `${paid.paymentId}: ${inv.number} paid ${paiseToDecimal(paid.amountPaise)} by ${paid.method}`, null);
  const after = await getInvoice(inv.id);
  if (after?.status === "paid") {
    await emit("invoice.paid", { id: inv.id, number: inv.number, entity: inv.entity_name, customer: inv.party_name, total_inr: inv.total, via: "razorpay" });
  }
  await notifyUsers([link.created_by], { kind: "payment", title: `Paid online: ${inv.number}`, body: `₹${paiseToDecimal(paid.amountPaise)} via Razorpay`, href: `/portal/invoices?inv=${inv.id}` });
  return "ok";
}
