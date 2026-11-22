import { getSql } from "./db";
import { seal, unseal } from "./crypto-box";
import type { UserRow } from "./users";
import { workspaceContext, workspaceForNew } from "./workspaces";

export type SecretRow = {
  id: string; workspace: string; title: string; username: string; url: string; owner_id: string; owner_email: string;
  share: "private" | "roles"; roles: string[]; has_notes: boolean; updated_at: string; last_seen: string | null;
};

/** Who may open a secret: its owner, or someone whose role it is shared with, inside the workspaces on view. */
const VISIBLE = `s.workspace = any($2::text[]) and (s.owner_id = $1 or (s.share = 'roles' and $3 = any(s.roles)))`;

export async function listSecrets(user: UserRow) {
  const sql = await getSql();
  return sql.query<SecretRow>(
    `select s.id, s.workspace, s.title, s.username, s.url, s.owner_id, u.email as owner_email, s.share, s.roles, (s.notes is not null) as has_notes,
            s.updated_at::text, (select max(created_at)::text from vault_secret_events e where e.secret_id = s.id and e.action = 'revealed') as last_seen
       from vault_secrets s join users u on u.id = s.owner_id where ${VISIBLE} order by s.title`,
    [user.id, (await workspaceContext()).inView, user.role],
  );
}

async function visible(user: UserRow, id: string) {
  const sql = await getSql();
  return (await sql.query<{ id: string; owner_id: string; secret: string; notes: string | null; title: string }>(
    `select s.id, s.owner_id, s.secret, s.notes, s.title from vault_secrets s where s.id = $4 and ${VISIBLE}`,
    [user.id, (await workspaceContext()).enterable, user.role, id],
  ))[0] ?? null;
}

async function log(id: string, email: string, action: string) {
  const sql = await getSql();
  await sql.query("insert into vault_secret_events (secret_id, actor_email, action) values ($1, $2, $3)", [id, email, action]);
}

export async function createSecret(user: UserRow, s: { title: string; username: string; url: string; secret: string; notes: string; share: "private" | "roles"; roles: string[] }) {
  const sql = await getSql();
  const id = (await sql.query<{ id: string }>(
    `insert into vault_secrets (workspace, title, username, url, secret, notes, owner_id, share, roles, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $7) returning id`,
    [await workspaceForNew(), s.title, s.username, s.url, seal({ v: s.secret }), s.notes ? seal({ v: s.notes }) : null, user.id, s.share, s.share === "roles" ? s.roles : []],
  ))[0].id;
  await log(id, user.email, "created");
  return id;
}

/** The plain secret and notes, for someone allowed to see them. Every look is logged. */
export async function revealSecret(user: UserRow, id: string) {
  const row = await visible(user, id);
  if (!row) return null;
  await log(id, user.email, "revealed");
  return { secret: unseal<{ v: string }>(row.secret)?.v ?? "", notes: row.notes ? unseal<{ v: string }>(row.notes)?.v ?? "" : "" };
}

/** Owners change their own entries; the Super Admin can also change shared ones. */
async function editable(user: UserRow, id: string) {
  const row = await visible(user, id);
  return row && (row.owner_id === user.id || user.role === "super_admin") ? row : null;
}

export async function updateSecret(user: UserRow, id: string, secret: string) {
  if (!(await editable(user, id))) return false;
  const sql = await getSql();
  await sql.query("update vault_secrets set secret = $2, updated_by = $3, updated_at = now() where id = $1", [id, seal({ v: secret }), user.id]);
  await log(id, user.email, "changed");
  return true;
}

export async function deleteSecret(user: UserRow, id: string) {
  const row = await editable(user, id);
  if (!row) return null;
  const sql = await getSql();
  await sql.query("delete from vault_secrets where id = $1", [id]);
  return row.title;
}

export async function secretHistory(user: UserRow, id: string) {
  if (!(await visible(user, id))) return [];
  const sql = await getSql();
  return sql.query<{ actor_email: string | null; action: string; created_at: string }>(
    "select actor_email, action, created_at::text from vault_secret_events where secret_id = $1 order by id desc limit 20", [id],
  );
}
