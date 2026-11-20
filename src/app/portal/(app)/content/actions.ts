"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSiteContent, resetSiteContent, saveSiteContent } from "@/lib/content";
import { cleanContent, defaultsFor, isSiteId, SITES } from "@/lib/content-fields";
import { requireSuperAdmin } from "@/lib/dal";
import { audit } from "@/lib/users";

function back(site: string, query: string): never {
  redirect(`/portal/content?site=${site}&${query}`);
}

function refresh(site: keyof typeof SITES) {
  revalidatePath(SITES[site].path);
}

export async function saveContent(formData: FormData) {
  const owner = await requireSuperAdmin();
  const site = formData.get("site");
  if (!isSiteId(site)) redirect("/portal/content");

  const input: Record<string, unknown> = {};
  for (const field of SITES[site].fields) input[field.key] = formData.get(field.key);
  const { values, reset, errors } = cleanContent(site, input);
  if (errors.length > 0) back(site, `error=${encodeURIComponent(errors[0])}`);

  const before = await getSiteContent(site);
  const defaults = defaultsFor(site);
  const after = { ...defaults, ...values };
  const changed = SITES[site].fields
    .map((field) => field.key)
    .filter((key) => (before[key] ?? "") !== (after[key] ?? ""));

  await saveSiteContent(site, values, reset, owner.id);
  if (changed.length > 0) {
    await audit({
      actorId: owner.id,
      actorEmail: owner.email,
      action: "content_updated",
      detail: `${SITES[site].where}: ${changed.join(", ")}`,
    });
  }
  refresh(site);
  back(site, changed.length > 0 ? "notice=saved" : "notice=unchanged");
}

export async function resetContent(formData: FormData) {
  const owner = await requireSuperAdmin();
  const site = formData.get("site");
  if (!isSiteId(site)) redirect("/portal/content");
  await resetSiteContent(site);
  await audit({
    actorId: owner.id,
    actorEmail: owner.email,
    action: "content_reset",
    detail: SITES[site].where,
  });
  refresh(site);
  back(site, "notice=reset");
}
