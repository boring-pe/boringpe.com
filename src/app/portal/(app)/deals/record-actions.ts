"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { getSql } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { createCase } from "@/lib/kyc";
import { oneLine } from "@/lib/ops-fields";
import { can, canSeeFirmData } from "@/lib/rbac";
import { audit } from "@/lib/users";
import { MAX_DOC_BYTES, isDocCategory, mimeFor, safeFileName } from "@/lib/vault-fields";
import { workspaceForNew } from "@/lib/workspaces";

// Actions on a deal's or a contact's record page. Each one acts on that record and comes back to it.

type Back = { kind: "deal" | "party"; id: string };
const ID = /^[0-9a-f-]{8,64}$/i;

function backTo(formData: FormData): Back {
  const [kind, id] = String(formData.get("back") ?? "").split(":");
  if ((kind !== "deal" && kind !== "party") || !id || !ID.test(id)) redirect("/portal/deals?notice=invalid");
  return { kind, id };
}
function back(b: Back, notice: string, hash = ""): never {
  redirect(`/portal/${b.kind === "deal" ? "deals" : "parties"}/${b.id}?notice=${notice}${hash}`);
}
const parseDate = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

/** The deal and contact a record's work belongs to. */
async function owners(b: Back) {
  const sql = await getSql();
  if (b.kind === "deal") {
    const d = (await sql.query<{ id: string; party_id: string | null }>("select id, party_id from deals where id = $1", [b.id]))[0];
    return d ? { dealId: d.id, partyId: d.party_id } : null;
  }
  const p = (await sql.query<{ id: string }>("select id from parties where id = $1", [b.id]))[0];
  return p ? { dealId: null, partyId: p.id } : null;
}

export async function addRecordTask(formData: FormData) {
  const user = await requireSection("deals");
  const b = backTo(formData);
  const own = await owners(b);
  const title = oneLine(formData.get("title"), 200);
  if (!own || title.length < 2) back(b, "invalid", "#tasks");
  const assignee = String(formData.get("assigneeId") ?? "") || null;
  const sql = await getSql();
  if (assignee && !(await sql.query("select 1 from users where id = $1 and status = 'active'", [assignee])).length) back(b, "invalid", "#tasks");
  await sql.query(
    "insert into tasks (title, deal_id, party_id, assignee_id, due_date, created_by, workspace) values ($1, $2, $3, $4, $5, $6, $7)",
    [title, own.dealId, own.partyId, assignee, parseDate(formData.get("due")), user.id, await workspaceForNew()],
  );
  await audit({ actorId: user.id, actorEmail: user.email, action: "task_added", detail: title });
  back(b, "task-added", "#tasks");
}

/** A file kept with the deal or contact. It goes into the BIDU Vault too, firm-only. */
export async function attachRecordDoc(formData: FormData) {
  const user = await requireSection("deals");
  const b = backTo(formData);
  if (!can(user.role, "vault") || !canSeeFirmData(user.role)) back(b, "forbidden", "#documents");
  const own = await owners(b);
  if (!own) back(b, "invalid", "#documents");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(b, "no-file", "#documents");
  if (file.size > MAX_DOC_BYTES) back(b, "too-big", "#documents");
  const fileName = safeFileName(file.name);
  const mime = mimeFor(fileName);
  if (!mime) back(b, "type", "#documents");
  const category = formData.get("category");
  if (!isDocCategory(category)) back(b, "invalid", "#documents");
  const title = oneLine(formData.get("title"), 200) || fileName;
  const id = await createDocument({ title, category, visibility: "firm", link: null, fileName, mime, content: new Uint8Array(await file.arrayBuffer()), by: user.id });
  const sql = await getSql();
  await sql.query("update documents set deal_id = $2, party_id = $3 where id = $1", [id, own.dealId, own.partyId]);
  await audit({ actorId: user.id, actorEmail: user.email, action: "document_added", detail: title });
  back(b, "doc-added", "#documents");
}

export async function linkDealParty(formData: FormData) {
  const user = await requireSection("deals");
  const b = backTo(formData);
  const partyId = String(formData.get("partyId") ?? "");
  const sql = await getSql();
  if (b.kind !== "deal" || !(await sql.query("select 1 from parties where id = $1", [partyId])).length) back(b, "invalid", "#contact");
  await sql.query("update deals set party_id = $2, updated_at = now() where id = $1", [b.id, partyId]);
  await audit({ actorId: user.id, actorEmail: user.email, action: "deal_party_linked", detail: b.id });
  back(b, "party-linked");
}

/** Opens a KYC case for the contact, linked to them. */
export async function startPartyKyc(formData: FormData) {
  const user = await requireSection("deals");
  const b = backTo(formData);
  if (!can(user.role, "kyc")) back(b, "forbidden");
  const own = await owners(b);
  if (!own?.partyId) back(b, "invalid", "#contact");
  const sql = await getSql();
  const p = (await sql.query<{ name: string; kind: string; email: string | null; has_case: boolean }>(
    "select name, kind, email, exists (select 1 from kyc_cases where party_id = p.id) as has_case from parties p where id = $1", [own.partyId]))[0];
  if (!p) back(b, "invalid");
  if (p.has_case) back(b, "kyc-exists");
  await createCase({
    subjectType: p.kind === "person" ? "person" : "entity", name: p.name, email: p.email, link: { party: own.partyId },
    company: p.kind === "company" || p.kind === "fund", gstRegistered: false, by: user.id, byEmail: user.email,
  });
  await audit({ actorId: user.id, actorEmail: user.email, action: "kyc_opened", detail: p.name });
  back(b, "kyc-started");
}

/** Ties a WhatsApp chat to a contact, so their messages show on the contact's page. */
export async function linkPartyChat(formData: FormData) {
  const user = await requireSection("deals");
  const b = backTo(formData);
  if (b.kind !== "party" || !can(user.role, "whatsapp")) back(b, "forbidden", "#whatsapp");
  const waId = String(formData.get("waId") ?? "");
  if (!/^[0-9]{6,15}$/.test(waId)) back(b, "invalid", "#whatsapp");
  const sql = await getSql();
  const r = await sql.query("update wa_contacts set party_id = $2 where wa_id = $1 returning wa_id", [waId, b.id]);
  if (!r.length) back(b, "invalid", "#whatsapp");
  await audit({ actorId: user.id, actorEmail: user.email, action: "chat_linked", detail: waId });
  back(b, "chat-linked", "#whatsapp");
}
