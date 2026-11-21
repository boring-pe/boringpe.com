"use server";

import { redirect } from "next/navigation";
import { createApproval, decideApproval, getApproval, withdrawApproval } from "@/lib/approvals";
import { isApprovalKind } from "@/lib/approval-kinds";
import { requireSection, requireSuperAdmin } from "@/lib/dal";
import { applyDecision } from "@/lib/ops";
import { audit } from "@/lib/users";

function back(notice: string): never {
  redirect(`/portal/approvals?notice=${notice}`);
}

/** Anyone with the Approvals section may ask. The Super Admin acts directly instead of asking. */
export async function requestApproval(formData: FormData) {
  const user = await requireSection("approvals");
  if (user.role === "super_admin") back("owner");
  const kind = formData.get("kind");
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  if (!isApprovalKind(kind) || title.length < 3 || title.length > 140 || detail.length > 2000) {
    back("invalid");
  }
  const created = await createApproval({
    kind,
    title,
    detail,
    requestedBy: user.id,
    requestedByEmail: user.email,
  });
  if (created === "too-many") back("too-many");
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "approval_requested",
    detail: `${kind}: ${title}`,
  });
  back("requested");
}

export async function withdrawRequest(formData: FormData) {
  const user = await requireSection("approvals");
  const row = await withdrawApproval(String(formData.get("id") ?? ""), user.id);
  if (!row) back("gone");
  await applyDecision(row, "withdrawn", user.id);
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "approval_withdrawn",
    detail: row.title,
  });
  back("withdrawn");
}

export async function decide(formData: FormData) {
  const owner = await requireSuperAdmin();
  const status = formData.get("status");
  const existing = await getApproval(String(formData.get("id") ?? ""));
  if (!existing || (status !== "approved" && status !== "rejected")) back("invalid");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const row = await decideApproval({ id: existing.id, status, deciderEmail: owner.email, note });
  if (!row) back("gone");
  await applyDecision(row, status, owner.id);
  await audit({
    actorId: owner.id,
    actorEmail: owner.email,
    action: status === "approved" ? "approval_approved" : "approval_rejected",
    targetEmail: row.requested_by_email,
    detail: row.title,
  });
  back(status);
}
