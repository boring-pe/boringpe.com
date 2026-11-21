import { handleRazorpay } from "@/lib/payments";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  const result = await handleRazorpay(raw, request.headers.get("x-razorpay-signature"), request.headers.get("x-razorpay-event-id"));
  if (result === "unauthorized") return new Response("Bad signature", { status: 401 });
  if (result === "not-configured") return new Response("Not configured", { status: 503 });
  return new Response("OK", { status: 200 });
}
