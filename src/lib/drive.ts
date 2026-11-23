import { getSql } from "./db";
import { workspaceContext, workspaceForNew } from "./workspaces";

export type FolderRow = { id: string; name: string; parent_id: string | null; workspace: string; files: number; folders: number };

const clean = (name: string) => name.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** Folders directly inside `parentId` (null: the top) in the workspaces on view. */
export async function listFolders(parentId: string | null) {
  const sql = await getSql();
  return sql.query<FolderRow>(
    `select f.id, f.name, f.parent_id, f.workspace,
            (select count(*)::int from documents d where d.folder_id = f.id) as files,
            (select count(*)::int from doc_folders c where c.parent_id = f.id) as folders
       from doc_folders f where f.workspace = any($1::text[]) and f.parent_id is not distinct from $2 order by lower(f.name)`,
    [(await workspaceContext()).inView, parentId],
  );
}

export async function getFolder(id: string) {
  const sql = await getSql();
  return (await sql.query<{ id: string; name: string; parent_id: string | null; workspace: string }>(
    "select id, name, parent_id, workspace from doc_folders where id = $1 and workspace = any($2::text[])",
    [id, (await workspaceContext()).enterable],
  ))[0] ?? null;
}

/** From the top down to this folder, for the breadcrumb. */
export async function folderPath(id: string | null) {
  const path: { id: string; name: string }[] = [];
  let cur = id ? await getFolder(id) : null;
  while (cur && path.length < 20) {
    path.unshift({ id: cur.id, name: cur.name });
    cur = cur.parent_id ? await getFolder(cur.parent_id) : null;
  }
  return path;
}

/** Every folder in view, as "Parent / Child" labels, for the move picker. */
export async function allFolders() {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; name: string; parent_id: string | null }>(
    "select id, name, parent_id from doc_folders where workspace = any($1::text[])",
    [(await workspaceContext()).inView],
  );
  const by = new Map(rows.map((r) => [r.id, r]));
  const label = (r: { name: string; parent_id: string | null }, depth = 0): string =>
    r.parent_id && by.has(r.parent_id) && depth < 20 ? `${label(by.get(r.parent_id)!, depth + 1)} / ${r.name}` : r.name;
  return rows.map((r) => ({ id: r.id, label: label(r) })).sort((a, b) => a.label.localeCompare(b.label));
}

export async function createFolder(name: string, parentId: string | null, by: string): Promise<"ok" | "invalid" | "exists"> {
  const n = clean(name);
  if (!n) return "invalid";
  const parent = parentId ? await getFolder(parentId) : null;
  if (parentId && !parent) return "invalid";
  const sql = await getSql();
  try {
    await sql.query("insert into doc_folders (workspace, parent_id, name, created_by) values ($1, $2, $3, $4)", [
      parent?.workspace ?? (await workspaceForNew()), parentId, n, by,
    ]);
    return "ok";
  } catch {
    return "exists";
  }
}

export async function renameFolder(id: string, name: string): Promise<"ok" | "invalid" | "exists"> {
  const n = clean(name);
  if (!n || !(await getFolder(id))) return "invalid";
  const sql = await getSql();
  try {
    await sql.query("update doc_folders set name = $2 where id = $1", [id, n]);
    return "ok";
  } catch {
    return "exists";
  }
}

/** Only an empty folder can be deleted, so no file is ever lost by accident. */
export async function deleteFolder(id: string): Promise<"ok" | "invalid" | "not-empty"> {
  const f = await getFolder(id);
  if (!f) return "invalid";
  const sql = await getSql();
  const n = (await sql.query<{ n: number }>(
    "select (select count(*) from documents where folder_id = $1) + (select count(*) from doc_folders where parent_id = $1) as n", [id],
  ))[0];
  if (Number(n.n) > 0) return "not-empty";
  await sql.query("delete from doc_folders where id = $1", [id]);
  return "ok";
}

/** Moves a file into a folder (or to the top) within the same workspace. */
export async function moveDocument(docId: string, folderId: string | null): Promise<boolean> {
  const sql = await getSql();
  const ws = (await workspaceContext()).enterable;
  if (folderId) {
    const f = await getFolder(folderId);
    if (!f) return false;
    return (await sql.query("update documents set folder_id = $2 where id = $1 and workspace = $3 returning id", [docId, folderId, f.workspace])).length > 0;
  }
  return (await sql.query("update documents set folder_id = null where id = $1 and workspace = any($2::text[]) returning id", [docId, ws])).length > 0;
}
