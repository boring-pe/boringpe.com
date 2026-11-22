#!/usr/bin/env node
/**
 * Restores a Boring Portal backup (.bpbak, from Console → Encrypted backup) into DATABASE_URL.
 *
 *   BACKUP_PASSPHRASE='…' DATABASE_URL=postgres://… node scripts/restore-backup.mjs file.bpbak [--replace]
 *   BACKUP_PASSPHRASE='…' node scripts/restore-backup.mjs file.bpbak --json > backup.json
 *
 * Run `npm run db:migrate` first so every table exists. The target must be empty unless --replace
 * is given. Every table it restores is cleared first, including rows the migrations seeded. Everything happens in one transaction: either the whole
 * backup lands or nothing changes. Tables load parents first, so foreign keys hold.
 */
import { createDecipheriv, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import pg from "pg";

const [file, ...flags] = process.argv.slice(2);
const passphrase = process.env.BACKUP_PASSPHRASE ?? "";
if (!file || !passphrase) {
  console.error("Usage: BACKUP_PASSPHRASE='…' DATABASE_URL=… node scripts/restore-backup.mjs <file.bpbak> [--replace | --json]");
  process.exit(2);
}

// Same format as src/lib/backup-format.ts.
const buf = await readFile(file);
if (buf.subarray(0, 6).toString() !== "BPBAK1") throw new Error("Not a Boring Portal backup.");
const key = scryptSync(passphrase, buf.subarray(6, 22), 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(22, 34));
decipher.setAuthTag(buf.subarray(34, 50));
let doc;
try {
  doc = JSON.parse(gunzipSync(Buffer.concat([decipher.update(buf.subarray(50)), decipher.final()])).toString("utf8"));
} catch {
  console.error("Wrong passphrase, or the file is damaged.");
  process.exit(1);
}
if (flags.includes("--json")) {
  process.stdout.write(JSON.stringify(doc, null, 2));
  process.exit(0);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("Set DATABASE_URL to the database to restore into.");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const existing = new Set((await client.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows.map((r) => r.table_name));
  const tables = Object.keys(doc.tables).filter((t) => t !== "_migrations" && existing.has(t));
  const missing = Object.keys(doc.tables).filter((t) => t !== "_migrations" && !existing.has(t));
  if (missing.length) console.warn(`Skipping tables this database does not have (run migrations?): ${missing.join(", ")}`);

  // Parents before children.
  const deps = (await client.query(
    `select tc.relname as child, tp.relname as parent from pg_constraint c
       join pg_class tc on tc.oid = c.conrelid join pg_class tp on tp.oid = c.confrelid
       join pg_namespace n on n.oid = tc.relnamespace where c.contype = 'f' and n.nspname = 'public'`,
  )).rows;
  const order = [];
  const seen = new Set();
  const visit = (t, stack = new Set()) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const d of deps) if (d.child === t && d.parent !== t && tables.includes(d.parent)) visit(d.parent, stack);
    seen.add(t);
    order.push(t);
  };
  for (const t of tables) visit(t);

  await client.query("begin");
  const users = Number((await client.query("select count(*)::int as n from users")).rows[0].n);
  if (users > 0 && !flags.includes("--replace")) throw new Error("The database is not empty. Add --replace to clear it first.");
  // Clears what migrations seeded (or, with --replace, everything) so the backup lands exactly.
  await client.query(`truncate ${order.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
  // Postings were checked when they were first made; on a database you own, skip re-checking them.
  await client.query("set local session_replication_role = replica").catch(() => console.warn("Could not pause triggers; loading with them on."));
  let rows = 0;
  for (const t of order) {
    const list = doc.tables[t] ?? [];
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500).map((r) => { const { _file_left_out, ...rest } = r; void _file_left_out; return rest; });
      await client.query(`insert into "${t}" select * from json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(chunk)]);
      rows += chunk.length;
    }
    // Keep serial counters ahead of restored ids.
    const serials = (await client.query(
      `select column_name, pg_get_serial_sequence($1, column_name) as seq from information_schema.columns
        where table_schema = 'public' and table_name = $2 and pg_get_serial_sequence($1, column_name) is not null`,
      [`public."${t}"`, t],
    )).rows;
    for (const s of serials) await client.query(`select setval($1, greatest(coalesce((select max("${s.column_name}") from "${t}"), 0), 1))`, [s.seq]);
  }
  await client.query("commit");
  console.log(`Restored ${rows} rows into ${order.length} tables from a backup made ${doc.created_at}.`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`Nothing was changed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
