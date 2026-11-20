#!/usr/bin/env node
/**
 * Applies pending files in ../migrations to DATABASE_URL (Neon). Runs before
 * `next build`, so every deploy brings the schema up to date. Each file runs in
 * one transaction and is recorded in `_migrations`, so re-running is safe.
 *
 * No DATABASE_URL (local builds) -> skipped; development uses embedded Postgres
 * that migrates itself (see src/lib/db.ts).
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log("[migrate] DATABASE_URL not set, skipping.");
  process.exit(0);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = (await readdir(dir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));
  let applied = 0;
  for (const name of files) {
    if (done.has(name)) continue;
    const text = await readFile(join(dir, name), "utf8");
    try {
      await client.query("begin");
      await client.query(text);
      await client.query("insert into _migrations (name) values ($1)", [name]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      console.error(`[migrate] failed on ${name}`);
      throw error;
    }
    console.log(`[migrate] applied ${name}`);
    applied += 1;
  }
  console.log(applied ? `[migrate] ${applied} applied.` : "[migrate] up to date.");
} catch (error) {
  console.error("[migrate]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
