import { redirect } from "next/navigation";
import { baseUrl } from "@/lib/base-url";
import { requireUser } from "@/lib/dal";
import { authorizeUrl } from "@/lib/mail";

/** Starts connecting a mailbox: sends the signed-in person to the provider to approve access. */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await requireUser();
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft" && provider !== "zoho") redirect("/portal/inbox?view=accounts&notice=invalid");
  const url = await authorizeUrl(provider, user.id, await baseUrl());
  redirect(url ?? "/portal/inbox?view=accounts&notice=not-setup");
}
