import { getCurrentUser } from "@/lib/dal";
import { getSql } from "@/lib/db";
import { encryptBackup, passphraseProblem } from "@/lib/backup-format";
import { audit } from "@/lib/users";
import { hit, tooMany } from "@/lib/rate-limit";

/** Columns that hold file contents, left out unless asked for (they make the file large). */
const FILE_COLUMNS: Record<string, string> = { documents: "content" };

/**
 * The whole database as one encrypted file, for the Super Admin only. Restore it on any Postgres
 * with scripts/restore-backup.mjs. Without the passphrase the file is unreadable.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin" || user.must_change_password) return new Response("Not allowed", { status: 403 });
  const limited = await hit("export", user.id, `${user.email}: backup`);
  if (!limited.ok) return tooMany(limited, false);
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") ?? "");
  const problem = passphraseProblem(passphrase);
  if (problem) return new Response(null, { status: 303, headers: { Location: `/portal/console?backup=${encodeURIComponent(problem)}` } });
  const withFiles = form.get("files") === "on";
  const sql = await getSql();
  const tables = (await sql.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  )).map((t) => t.table_name);
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) continue;
    const rows = await sql.query<{ r: Record<string, unknown> }>(`select row_to_json(t) as r from "${t}" t`);
    const drop = !withFiles ? FILE_COLUMNS[t] : undefined;
    out[t] = rows.map(({ r }) => (drop ? { ...r, [drop]: null, _file_left_out: true } : r));
  }
  const stamp = new Date().toISOString();
  const file = encryptBackup({ format: 1, created_at: stamp, tables: out }, passphrase);
  await audit({ actorId: user.id, actorEmail: user.email, action: "backup_downloaded", detail: `${tables.length} tables${withFiles ? ", with files" : ""}` });
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="boring-portal-${stamp.slice(0, 10)}.bpbak"`,
      "cache-control": "no-store",
    },
  });
}
