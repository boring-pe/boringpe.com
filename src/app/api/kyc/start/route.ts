import { authorizeUrl } from "@/lib/kyc";
import { baseUrl } from "@/lib/base-url";
import { hit, tooMany } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security-calc";

const go = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

/** From the consent page to the DigiLocker or Entity Locker sign-in. */
export async function POST(request: Request) {
  const limited = await hit("kycStart", clientIp((n) => request.headers.get(n)), "KYC consent");
  if (!limited.ok) return tooMany(limited, false);
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || form.get("consent") !== "yes") return go(`/portal/verify/${encodeURIComponent(token)}?e=consent`);
  const url = await authorizeUrl(token, `${await baseUrl()}/api/kyc/callback`);
  return url ? go(url) : go("/portal/verify/finished?r=invalid");
}
