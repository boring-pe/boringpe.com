import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { openNotification } from "@/lib/notify";

/** Marks a notification read and goes where it points. Only ever to a page inside the portal. */
export async function GET(request: Request) {
  const user = await requireUser();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  redirect((await openNotification(id, user.id)) ?? "/portal/notifications");
}
