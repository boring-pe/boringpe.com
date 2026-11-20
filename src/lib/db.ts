import fs from "node:fs";
import path from "node:path";
import { adminEmails } from "./admin-emails";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";

export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

const migrationsDir = () => path.join(process.cwd(), "migrations");

function migrationFiles() {
  return fs
    .readdirSync(migrationsDir())
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
}

/** Production uses Neon through `pg`. Without DATABASE_URL, development uses an embedded Postgres on disk. */
async function connect(): Promise<Sql> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5 });
    return toSql(async <T>(text: string, params: unknown[]) => {
      const result = await pool.query(text, params);
      return result.rows as T[];
    });
  }

  if (process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) {
    throw new Error("DATABASE_URL is not set. Add your Neon connection string.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await pg.query<{ name: string }>("select name from _migrations")).rows.map((r) => r.name));
  for (const name of migrationFiles()) {
    if (done.has(name)) continue;
    const text = fs.readFileSync(path.join(migrationsDir(), name), "utf8");
    await pg.transaction(async (tx) => {
      await tx.exec(text);
      await tx.query("insert into _migrations (name) values ($1)", [name]);
    });
  }
  return toSql(async <T>(text: string, params: unknown[]) => (await pg.query<T>(text, params)).rows);
}

/**
 * First admin seat. Creates the first ADMIN_EMAILS address with ADMIN_BOOTSTRAP_PASSWORD
 * if that user does not exist yet. It never resets an existing password, and the user
 * must choose a new one at first sign-in. Remove the variable once you are in.
 */
async function bootstrapAdmin(sql: Sql) {
  const email = adminEmails()[0];
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.warn(`[auth] ADMIN_BOOTSTRAP_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters; ignored.`);
    return;
  }
  const existing = await sql<{ id: string }>`select id from users where lower(email) = ${email}`;
  if (existing.length > 0) return;
  await sql`
    insert into users (email, name, role, status, password_hash, must_change_password, created_by)
    values (${email}, ${"Admin"}, ${"admin"}, ${"active"}, ${await hashPassword(password)}, ${true}, ${"bootstrap"})
    on conflict do nothing
  `;
}

const g = globalThis as typeof globalThis & { __rahulSql?: Promise<Sql> };

export function getSql(): Promise<Sql> {
  g.__rahulSql ??= (async () => {
    const sql = await connect();
    await bootstrapAdmin(sql);
    return sql;
  })().catch((error) => {
    g.__rahulSql = undefined;
    throw error;
  });
  return g.__rahulSql;
}
