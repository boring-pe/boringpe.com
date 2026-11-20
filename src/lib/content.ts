import { getSql } from "./db";
import { defaultsFor, SITES, type SiteId } from "./content-fields";

/** Public copy for a site: stored edits over the defaults. Never throws, so a public page always renders. */
export async function getSiteContent(site: SiteId): Promise<Record<string, string>> {
  const content = defaultsFor(site);
  try {
    const sql = await getSql();
    const rows = await sql.query<{ key: string; value: string }>(
      "select key, value from site_content where site = $1",
      [site],
    );
    const known = new Set(SITES[site].fields.map((field) => field.key));
    for (const row of rows) if (known.has(row.key)) content[row.key] = row.value;
  } catch {
    // No database reachable (for example a local build): the defaults are the page.
  }
  return content;
}

export async function saveSiteContent(
  site: SiteId,
  values: Record<string, string>,
  reset: string[],
  updatedBy: string,
) {
  const sql = await getSql();
  for (const [key, value] of Object.entries(values)) {
    await sql.query(
      `insert into site_content (site, key, value, updated_by) values ($1, $2, $3, $4)
       on conflict (site, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [site, key, value, updatedBy],
    );
  }
  for (const key of reset) {
    await sql.query("delete from site_content where site = $1 and key = $2", [site, key]);
  }
}

export async function resetSiteContent(site: SiteId) {
  const sql = await getSql();
  await sql.query("delete from site_content where site = $1", [site]);
}
