import { getSql } from "./db";
import { cleanPrefs, type Prefs } from "./prefs-fields";

export async function getPrefs(userId: string): Promise<Prefs> {
  const sql = await getSql();
  const row = (await sql.query<{ prefs: unknown }>("select prefs from users where id = $1", [userId]))[0];
  return cleanPrefs(row?.prefs);
}

export async function updatePrefs(userId: string, change: Partial<Prefs>): Promise<Prefs> {
  const next = cleanPrefs({ ...(await getPrefs(userId)), ...change });
  const sql = await getSql();
  await sql.query("update users set prefs = $2::jsonb where id = $1", [userId, JSON.stringify(next)]);
  return next;
}
