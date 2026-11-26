"use server";

import { redirect } from "next/navigation";
import { createApproval } from "@/lib/approvals";
import { requireSection } from "@/lib/dal";
import { looksLikeEmail, normalizeEmail } from "@/lib/admin-emails";
import { createDeal, createParty, getDeal, parkStage, partyExists, setStage, unparkStage } from "@/lib/ops";
import { GATED_STAGES, isPartyKind, isPillar, isStage, oneLine, parseOptionalAmount, stageLabel } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

function back(notice: string): never {
  redirect(`/portal/deals?notice=${notice}`);
}

export async function addParty(formData: FormData) {
  const user = await requireSection("deals");
  const name = oneLine(formData.get("name"), 120);
  const kind = formData.get("kind");
  const emailRaw = normalizeEmail(formData.get("email"));
  if (name.length < 2 || !isPartyKind(kind)) back("invalid");
  if (emailRaw && !looksLikeEmail(emailRaw)) back("invalid");
  await createParty({ name, kind, email: emailRaw || null, notes: oneLine(formData.get("notes"), 500), by: user.id });
  await audit({ actorId: user.id, actorEmail: user.email, action: "party_added", detail: name });
  // Added from the Contacts page: go back there.
  if (formData.get("from") === "parties") redirect("/portal/parties?notice=party-added");
  back("party-added");
}

export async function addDeal(formData: FormData) {
  const user = await requireSection("deals");
  const name = oneLine(formData.get("name"), 140);
  const pillar = formData.get("pillar");
  const partyRaw = String(formData.get("partyId") ?? "");
  const value = parseOptionalAmount(formData.get("value"));
  if (name.length < 2 || !isPillar(pillar) || value === "bad") back("invalid");
  let partyId: string | null = null;
  if (partyRaw) {
    if (!(await partyExists(partyRaw))) back("invalid");
    partyId = partyRaw;
  }
  await createDeal({ name, pillar, partyId, value, notes: oneLine(formData.get("notes"), 1000), by: user.id });
  await audit({ actorId: user.id, actorEmail: user.email, action: "deal_added", detail: `${pillar}: ${name}` });
  back("deal-added");
}

/** The Super Admin moves a deal directly. Everyone else asks when the move is to Closing or Closed. */
export async function moveDeal(formData: FormData) {
  const user = await requireSection("deals");
  const stage = formData.get("stage");
  const deal = await getDeal(String(formData.get("dealId") ?? ""));
  if (!deal || !isStage(stage) || deal.stage === stage) back("invalid");
  const owner = user.role === "super_admin";

  if (!owner && deal.stage === "closed") back("owner-only");
  if (owner || !GATED_STAGES.includes(stage)) {
    await setStage(deal.id, stage, { id: user.id, email: user.email });
    await audit({ actorId: user.id, actorEmail: user.email, action: "deal_moved", detail: `${deal.name}: ${deal.stage} to ${stage}` });
    back("moved");
  }
  if (stage !== "closing" && stage !== "closed") back("invalid");
  if (!(await parkStage(deal.id, stage))) back("already-waiting");
  const created = await createApproval({
    kind: "deal",
    title: `Move "${deal.name}" to ${stageLabel(stage)}`,
    detail: `From ${stageLabel(deal.stage)}. Requested by ${user.email}.`,
    requestedBy: user.id,
    requestedByEmail: user.email,
    refType: "deal_stage",
    refId: deal.id,
  });
  if (created === "too-many") {
    await unparkStage(deal.id);
    back("too-many");
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: "deal_move_requested", detail: `${deal.name} to ${stage}` });
  back("requested");
}
