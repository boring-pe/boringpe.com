// Pure helpers for the portal's menu and list filters. No imports, so the test runner can load it directly.
// Plain module on purpose: a constant imported from a "use client" file into a server component is
// a client reference, not the value.

/** Cookies that remember the sidebar on this device. */
export const FOLD_COOKIE = "portal_fold";
export const RAIL_COOKIE = "portal_rail";

/** The menu link a path belongs to: the longest one that is the path or a folder above it. */
export function activeHref(path: string, hrefs: string[]): string | null {
  return [...hrefs].sort((a, b) => b.length - a.length).find((h) => path === h || path.startsWith(`${h}/`)) ?? null;
}

/** Whether a list row matches: every word typed appears in its text, and it carries the chosen tag if any. */
export function rowMatches(text: string, tags: string[], q: string, chip: string | null): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w)) && (!chip || tags.includes(chip));
}

/** Folded sidebar groups from the cookie: known ids only, at most a dozen. */
export function parseFolds(raw: string | undefined, known: string[]): string[] {
  let text = raw ?? "";
  try { text = decodeURIComponent(text); } catch { /* keep it as it came */ }
  return text.split(",").filter((g) => known.includes(g)).slice(0, 12);
}
