import { createHash } from "node:crypto";
import { getSql } from "./db";
import type { DocCategory } from "./vault-fields";
import { workspaceContext, workspaceForNew } from "./workspaces";

export type DocRow = {
  id: string; title: string; category: DocCategory; visibility: "firm" | "linked";
  entity_id: string | null; venture_id: string | null; holding_id: string | null; linked_name: string | null;
  file_name: string; mime: string; size: number; uploaded_by_email: string | null; created_at: string;
};

/** Which documents an external person may see: shared ones linked to something they are linked to. */
const EXTERNAL_FILTER = `
  d.visibility = 'linked' and d.workspace <> 'personal' and (
    (d.entity_id is not null and exists (select 1 from access_scopes s where s.user_id = $1 and s.scope_type = 'entity' and s.ref_id = d.entity_id))
    or (d.venture_id is not null and (
         exists (select 1 from access_scopes s where s.user_id = $1 and s.scope_type = 'venture' and s.ref_id = d.venture_id)
         or exists (select 1 from venture_operators o where o.venture_id = d.venture_id and o.user_id = $1)))
    or (d.holding_id is not null and exists (select 1 from access_scopes s where s.user_id = $1 and s.scope_type = 'holding' and s.ref_id = d.holding_id))
  )`;

const DOC_SELECT = `
  select d.id, d.title, d.category, d.visibility, d.entity_id, d.venture_id, d.holding_id,
         coalesce(e.name, v.name, h.name) as linked_name, d.file_name, d.mime, d.size, u.email as uploaded_by_email,
         to_char(d.created_at, 'YYYY-MM-DD') as created_at
    from documents d left join entities e on e.id = d.entity_id left join ventures v on v.id = d.venture_id
    left join holdings h on h.id = d.holding_id left join users u on u.id = d.uploaded_by`;

/** firmView: the whole vault. Otherwise only what `userId` may see. */
export async function listDocuments(userId: string, firmView: boolean) {
  const sql = await getSql();
  return firmView
    ? sql.query<DocRow>(`${DOC_SELECT} where d.workspace = any($1::text[]) order by d.created_at desc limit 500`, [(await workspaceContext()).inView])
    : sql.query<DocRow>(`${DOC_SELECT} where ${EXTERNAL_FILTER} order by d.created_at desc limit 500`, [userId]);
}

/** The file, only if this person may download it. */
export async function readDocument(id: string, userId: string, firmView: boolean) {
  const sql = await getSql();
  const rows = await sql.query<{ file_name: string; mime: string; content: Uint8Array }>(
    `select d.file_name, d.mime, d.content from documents d
      where d.id = $2 and (($3::boolean and d.workspace = any($4::text[])) or (${EXTERNAL_FILTER}))`,
    [userId, id, firmView, (await workspaceContext()).enterable],
  );
  return rows[0] ?? null;
}

export async function createDocument(d: {
  title: string; category: DocCategory; visibility: "firm" | "linked"; link: { type: "entity" | "venture" | "holding"; id: string } | null;
  fileName: string; mime: string; content: Uint8Array; by: string;
}) {
  const sql = await getSql();
  const sha256 = createHash("sha256").update(d.content).digest("hex");
  // A document linked to an entity, venture or holding lives in that item's workspace.
  const owner = d.link
    ? (await sql.query<{ workspace: string }>(
        d.link.type === "entity" ? "select workspace from entities where id = $1"
          : d.link.type === "venture" ? "select e.workspace from ventures v join entities e on e.id = v.entity_id where v.id = $1"
          : "select e.workspace from holdings h join entities e on e.id = h.holder_entity_id where h.id = $1",
        [d.link.id],
      ))[0]?.workspace
    : undefined;
  const rows = await sql.query<{ id: string }>(
    `insert into documents (title, category, visibility, entity_id, venture_id, holding_id, file_name, mime, size, sha256, content, uploaded_by, workspace)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [
      d.title, d.category, d.visibility,
      d.link?.type === "entity" ? d.link.id : null, d.link?.type === "venture" ? d.link.id : null, d.link?.type === "holding" ? d.link.id : null,
      d.fileName, d.mime, d.content.byteLength, sha256, Buffer.from(d.content), d.by, owner ?? (await workspaceForNew()),
    ],
  );
  return rows[0].id;
}

export async function deleteDocument(id: string) {
  const sql = await getSql();
  const rows = await sql.query<{ title: string }>(
    "delete from documents where id = $1 and workspace = any($2::text[]) returning title",
    [id, (await workspaceContext()).enterable],
  );
  return rows[0]?.title ?? null;
}

/** Checks that a link target exists. */
export async function linkExists(type: "entity" | "venture" | "holding", id: string) {
  const sql = await getSql();
  const ws = (await workspaceContext()).inView;
  const text = type === "entity" ? "select 1 from entities where id = $1 and workspace = any($2::text[])"
    : type === "venture" ? "select 1 from ventures v join entities e on e.id = v.entity_id where v.id = $1 and e.workspace = any($2::text[])"
    : "select 1 from holdings h join entities e on e.id = h.holder_entity_id where h.id = $1 and e.workspace = any($2::text[])";
  return (await sql.query(text, [id, ws])).length > 0;
}

/** External people who can see documents linked to this item. */
export async function linkedUsers(type: "entity" | "venture" | "holding", id: string) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `select user_id as id from access_scopes where scope_type = $1 and ref_id = $2
     union select user_id from venture_operators where $1 = 'venture' and venture_id = $2 and user_id is not null`,
    [type, id],
  );
  return rows.map((r) => r.id);
}
