import { completeLocker } from "@/lib/kyc";
import { baseUrl } from "@/lib/base-url";

const go = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

/** Back from DigiLocker or Entity Locker. The one-time state ties it to the link that started it. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return go("/portal/verify/finished?r=cancelled");
  const r = await completeLocker(code, state, `${await baseUrl()}/api/kyc/callback`);
  return go(`/portal/verify/finished?r=${r}`);
}
