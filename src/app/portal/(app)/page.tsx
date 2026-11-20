import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { firstAllowedHref } from "@/lib/rbac";

export default async function PortalIndex() {
  const user = await requireUser();
  redirect(user.must_change_password ? "/portal/account" : firstAllowedHref(user.role));
}
