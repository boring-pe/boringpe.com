import { redirect } from "next/navigation";
import { baseUrl } from "@/lib/base-url";
import { requireUser } from "@/lib/dal";
import { logEvent } from "@/lib/integrations";
import { completeOAuth } from "@/lib/mail";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await requireUser();
  const { provider } = await params;
  const q = new URL(request.url).searchParams;
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state || q.get("error")) {
    await logEvent(provider, "mailbox_connect", false, q.get("error_description") ?? q.get("error") ?? "cancelled", user.email);
    redirect("/portal/inbox?view=accounts&notice=cancelled");
  }
  let ok = true;
  let message = "";
  try {
    message = await completeOAuth(provider, code, state, user.id, await baseUrl());
  } catch (err) {
    ok = false;
    message = (err as Error).message;
  }
  await logEvent(provider, "mailbox_connect", ok, ok ? `Connected ${message}` : message, user.email);
  redirect(`/portal/inbox?view=accounts&notice=${ok ? "connected" : "connect-failed"}`);
}
