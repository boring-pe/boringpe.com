"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { isAccountType, isEntityKind, validateJournal, type LineInput } from "@/lib/accounting";
import { createAccount, createEntity, listAccounts, listEntities, postEntry, reverseEntry } from "@/lib/books";
import { canPostBooks } from "@/lib/rbac";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

const ROWS = 6;

function back(entity: string, view: string, notice: string): never {
  redirect(`/portal/books?e=${encodeURIComponent(entity)}&view=${view}&notice=${notice}`);
}

async function entityOrBack(id: unknown) {
  const entities = await listEntities();
  const found = entities.find((e) => e.id === id);
  if (!found) redirect("/portal/books?notice=invalid");
  return found;
}

export async function postJournal(formData: FormData) {
  const user = await requireSection("books");
  const entity = await entityOrBack(formData.get("entityId"));
  if (!canPostBooks(user.role)) back(entity.id, "journal", "forbidden");
  const date = parseDate(formData.get("date"));
  const memo = oneLine(formData.get("memo"), 300);
  if (!date || memo.length < 3) back(entity.id, "journal", "details");

  const accounts = new Set((await listAccounts(entity.id)).filter((a) => a.active).map((a) => a.id));
  const rows: LineInput[] = [];
  for (let i = 0; i < ROWS; i++) {
    rows.push({
      accountId: String(formData.get(`account${i}`) ?? ""),
      debit: String(formData.get(`debit${i}`) ?? ""),
      credit: String(formData.get(`credit${i}`) ?? ""),
    });
  }
  const { lines, errors } = validateJournal(rows);
  if (errors.length > 0) back(entity.id, "journal", "unbalanced");
  if (lines.some((l) => !accounts.has(l.accountId))) back(entity.id, "journal", "details");

  const result = await postEntry({ entityId: entity.id, date, memo, lines, by: user.id });
  if (!result.ok) back(entity.id, "journal", "failed");
  await audit({
    actorId: user.id, actorEmail: user.email, action: "journal_posted", detail: `${entity.name}: ${memo}`,
  });
  back(entity.id, "journal", "posted");
}

/** Only the Super Admin can undo a posted entry, and it is undone by a mirror entry, never by deleting. */
export async function reverseJournal(formData: FormData) {
  const user = await requireSection("books");
  const entity = await entityOrBack(formData.get("entityId"));
  if (user.role !== "super_admin") back(entity.id, "journal", "forbidden");
  const id = String(formData.get("entryId") ?? "");
  const date = parseDate(formData.get("date")) ?? new Date().toISOString().slice(0, 10);
  const made = await reverseEntry(id, date, user.id);
  if (!made) back(entity.id, "journal", "cannot-reverse");
  await audit({ actorId: user.id, actorEmail: user.email, action: "journal_reversed", detail: `${entity.name}: ${id}` });
  back(entity.id, "journal", "reversed");
}

export async function addAccount(formData: FormData) {
  const user = await requireSection("books");
  const entity = await entityOrBack(formData.get("entityId"));
  if (!canPostBooks(user.role)) back(entity.id, "accounts", "forbidden");
  const code = String(formData.get("code") ?? "").trim();
  const name = oneLine(formData.get("name"), 80);
  const type = formData.get("type");
  if (!/^[0-9]{3,6}$/.test(code) || name.length < 2 || !isAccountType(type)) back(entity.id, "accounts", "invalid");
  const result = await createAccount({ entityId: entity.id, code, name, type });
  if (result === "exists") back(entity.id, "accounts", "code-taken");
  await audit({ actorId: user.id, actorEmail: user.email, action: "account_added", detail: `${entity.name}: ${code} ${name}` });
  back(entity.id, "accounts", "account-added");
}

export async function addEntity(formData: FormData) {
  const user = await requireSection("books");
  if (user.role !== "super_admin") redirect("/portal/books?notice=forbidden");
  const name = oneLine(formData.get("name"), 80);
  const kind = formData.get("kind");
  const legalForm = oneLine(formData.get("legalForm"), 80);
  const parentRaw = String(formData.get("parentId") ?? "");
  if (name.length < 2 || !isEntityKind(kind)) redirect("/portal/books?notice=invalid");
  let parentId: string | null = null;
  if (parentRaw) {
    const parent = (await listEntities()).find((e) => e.id === parentRaw);
    if (!parent) redirect("/portal/books?notice=invalid");
    parentId = parent.id;
  }
  const id = await createEntity({ name, kind, legalForm, parentId, by: user.id });
  if (id === "exists") redirect("/portal/books?notice=entity-exists");
  await audit({ actorId: user.id, actorEmail: user.email, action: "entity_created", detail: `${name} (${kind})` });
  back(id, "overview", "entity-added");
}
