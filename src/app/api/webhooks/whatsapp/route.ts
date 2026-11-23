import { hit, tooMany } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security-calc";
import { receive, verifyChallenge } from "@/lib/whatsapp";

/** Meta's subscription check: echo the challenge only when the verify token matches. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (await verifyChallenge(q.get("hub.mode"), q.get("hub.verify_token"))) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Incoming messages and delivery statuses. The body is checked against Meta's signature before anything is read. */
export async function POST(request: Request) {
  const limited = await hit("webhook", clientIp((n) => request.headers.get(n)), "webhook");
  if (!limited.ok) return tooMany(limited, false);
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  const result = await receive(raw, request.headers.get("x-hub-signature-256"));
  if (result === "unauthorized") return new Response("Bad signature", { status: 401 });
  if (result === "not-configured") return new Response("Not configured", { status: 503 });
  return new Response("OK", { status: 200 });
}
