import { hit, tooMany } from "./rate-limit";
import { confidentialLine } from "./security-calc";
import { audit, type UserRow } from "./users";

/**
 * Every export and download goes through here: it is counted against the person's hourly
 * limit and written to the audit log, so a leak can be traced to who took what and when.
 * Returns a 429 response when the limit is passed, otherwise null.
 */
export async function guardExport(user: Pick<UserRow, "id" | "email">, what: string, kind: "export" | "download" = "export"): Promise<Response | null> {
  const v = await hit(kind, user.id, `${user.email}: ${what}`);
  if (!v.ok) return tooMany(v, false);
  await audit({ actorId: user.id, actorEmail: user.email, action: kind, detail: what.slice(0, 200) });
  return null;
}

/** The last line of every CSV: who exported it and when. */
export const csvFooter = (email: string) => `\r\n\r\n${confidentialLine(email, new Date())}`;
