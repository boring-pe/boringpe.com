// Pure Razorpay helpers: webhook signatures and the paid-link payload. Only node:crypto.
import { createHmac, timingSafeEqual } from "node:crypto";

/** X-Razorpay-Signature is the hex HMAC-SHA256 of the raw body with the webhook secret. */
export function validRazorpaySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !/^[0-9a-f]{64}$/i.test(header) || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(header.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}

export type PaidLink = { linkId: string; paymentId: string; amountPaise: bigint; feePaise: bigint; taxPaise: bigint; method: string };

/** The parts of a payment_link.paid event the books need; null for any other event. */
export function parsePaidLink(payload: unknown): PaidLink | null {
  const p = payload as {
    event?: string;
    payload?: { payment_link?: { entity?: { id?: string; amount_paid?: number } }; payment?: { entity?: { id?: string; amount?: number; fee?: number; tax?: number; method?: string; status?: string } } };
  };
  if (p?.event !== "payment_link.paid") return null;
  const link = p.payload?.payment_link?.entity;
  const pay = p.payload?.payment?.entity;
  if (!link?.id || !pay?.id || !Number.isInteger(pay.amount)) return null;
  return {
    linkId: link.id, paymentId: pay.id, amountPaise: BigInt(pay.amount!), feePaise: BigInt(pay.fee ?? 0), taxPaise: BigInt(pay.tax ?? 0),
    method: pay.method ?? "",
  };
}

/** Reference ids are unique per link and at most 40 characters. */
export const linkReference = (invoiceNumber: string, attempt: number) => `${invoiceNumber}${attempt ? `-${attempt}` : ""}`.slice(0, 40);
