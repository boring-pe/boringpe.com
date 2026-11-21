"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { listEntities } from "@/lib/books";
import { contribute } from "@/lib/investments";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

function back(notice: string): never {
  redirect(`/portal/marrow?notice=${notice}`);
}

/** Only the Super Admin moves money into Impact Marrow. */
export async function addContribution(formData: FormData) {
  const user = await requireSection("marrow");
  if (user.role !== "super_admin") back("forbidden");
  const entities = await listEntities();
  const from = String(formData.get("fromEntityId") ?? "");
  const to = String(formData.get("toEntityId") ?? "");
  const amount = parsePaise(String(formData.get("amount") ?? ""));
  const date = parseDate(formData.get("date")) ?? new Date().toISOString().slice(0, 10);
  const memo = oneLine(formData.get("memo"), 200);
  const receiver = entities.find((e) => e.id === to);
  if (!receiver || (receiver.kind !== "impact_marrow" && receiver.kind !== "fund")) back("invalid");
  if (from && (from === to || !entities.some((e) => e.id === from))) back("invalid");
  if (!amount) back("invalid");
  try {
    await contribute({ fromEntityId: from || null, toEntityId: receiver.id, amount, date, memo, by: user.id });
  } catch {
    back("books-refused");
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: "contribution", detail: `${receiver.name}: ${memo}` });
  back("contributed");
}
