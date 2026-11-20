import { getSql } from "./db";
import { isRole, type Role } from "./rbac";

export type Status = "active" | "disabled";

export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  email_verified: Date | null;
  image: string | null;
  role: Role;
  status: Status;
  password_hash: string | null;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  session_epoch: number;
  last_sign_in_at: Date | null;
  created_by: string | null;
  created_at: Date;
};

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

const COLUMNS = `id, name, email, email_verified, image, role, status, password_hash,
  must_change_password, failed_attempts, locked_until, session_epoch, last_sign_in_at,
  created_by, created_at`;

function clean(row: UserRow | undefined): UserRow | null {
  if (!row) return null;
  return isRole(row.role) ? row : null;
}

export async function getUserById(id: string) {
  const sql = await getSql();
  const rows = await sql.query<UserRow>(`select ${COLUMNS} from users where id = $1`, [id]);
  return clean(rows[0]);
}

export async function getUserByEmail(email: string) {
  const sql = await getSql();
  const rows = await sql.query<UserRow>(
    `select ${COLUMNS} from users where lower(email) = lower($1)`,
    [email],
  );
  return clean(rows[0]);
}

export async function listUsers() {
  const sql = await getSql();
  const rows = await sql.query<UserRow>(`select ${COLUMNS} from users order by created_at asc`);
  return rows.filter((row) => isRole(row.role));
}

export async function createUser(input: {
  email: string;
  name: string | null;
  role: Role;
  passwordHash?: string | null;
  mustChangePassword?: boolean;
  createdBy: string | null;
}) {
  const sql = await getSql();
  const rows = await sql.query<UserRow>(
    `insert into users (email, name, role, status, password_hash, must_change_password, created_by)
     values ($1, $2, $3, 'active', $4, $5, $6)
     returning ${COLUMNS}`,
    [
      input.email,
      input.name,
      input.role,
      input.passwordHash ?? null,
      input.mustChangePassword ?? false,
      input.createdBy,
    ],
  );
  return rows[0] as UserRow;
}

export async function setRole(id: string, role: Role) {
  const sql = await getSql();
  await sql.query("update users set role = $2 where id = $1", [id, role]);
}

/** Disabling also bumps the epoch so any live session stops working on its next request. */
export async function setStatus(id: string, status: Status) {
  const sql = await getSql();
  await sql.query(
    "update users set status = $2, session_epoch = session_epoch + 1 where id = $1",
    [id, status],
  );
}

export async function setPassword(id: string, hash: string, mustChange: boolean) {
  const sql = await getSql();
  await sql.query(
    `update users set password_hash = $2, must_change_password = $3,
       failed_attempts = 0, locked_until = null, session_epoch = session_epoch + 1
     where id = $1`,
    [id, hash, mustChange],
  );
}

export async function revokeSessions(id: string) {
  const sql = await getSql();
  await sql.query("update users set session_epoch = session_epoch + 1 where id = $1", [id]);
}

export async function recordFailedLogin(id: string) {
  const sql = await getSql();
  await sql.query(
    `update users set
       failed_attempts = failed_attempts + 1,
       locked_until = case
         when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3)
         else locked_until end
     where id = $1`,
    [id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
  );
}

export async function recordSignIn(id: string) {
  const sql = await getSql();
  await sql.query(
    "update users set failed_attempts = 0, locked_until = null, last_sign_in_at = now() where id = $1",
    [id],
  );
}

export async function countActiveAdmins() {
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    "select count(*)::int as n from users where role = 'admin' and status = 'active'",
  );
  return Number(rows[0]?.n ?? 0);
}

export type AuditRow = {
  id: number;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  detail: string | null;
  created_at: Date;
};

export async function audit(input: {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetEmail?: string | null;
  detail?: string | null;
}) {
  const sql = await getSql();
  await sql.query(
    `insert into access_audit (actor_id, actor_email, action, target_email, detail)
     values ($1, $2, $3, $4, $5)`,
    [input.actorId, input.actorEmail, input.action, input.targetEmail ?? null, input.detail ?? null],
  );
}

export async function listAudit(limit = 25) {
  const sql = await getSql();
  return sql.query<AuditRow>(
    `select id, actor_email, action, target_email, detail, created_at
     from access_audit order by created_at desc, id desc limit $1`,
    [limit],
  );
}
