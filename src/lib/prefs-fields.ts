// Pure: the appearance choices a person can make, and cleaning what is stored.

export const THEMES = ["system", "light", "dark"] as const;
export const ACCENTS = [
  { id: "green", label: "Ledger green", swatch: "#1f5f41" },
  { id: "navy", label: "Navy", swatch: "#22407a" },
  { id: "indigo", label: "Indigo", swatch: "#4646c2" },
  { id: "teal", label: "Teal", swatch: "#146b6b" },
  { id: "maroon", label: "Maroon", swatch: "#7d2a38" },
  { id: "gold", label: "Gold", swatch: "#946a17" },
] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

export type Prefs = {
  theme: (typeof THEMES)[number];
  accent: (typeof ACCENTS)[number]["id"];
  density: (typeof DENSITIES)[number];
  pinned: string[];
};

export const DEFAULT_PREFS: Prefs = { theme: "system", accent: "green", density: "comfortable", pinned: [] };

/** Whatever is stored, a valid set of preferences comes out; unknown pins are dropped later against the person's sections. */
export function cleanPrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    theme: (THEMES as readonly string[]).includes(r.theme as string) ? (r.theme as Prefs["theme"]) : DEFAULT_PREFS.theme,
    accent: ACCENTS.some((a) => a.id === r.accent) ? (r.accent as Prefs["accent"]) : DEFAULT_PREFS.accent,
    density: (DENSITIES as readonly string[]).includes(r.density as string) ? (r.density as Prefs["density"]) : DEFAULT_PREFS.density,
    pinned: Array.isArray(r.pinned) ? [...new Set(r.pinned.filter((x): x is string => typeof x === "string" && /^[a-z]{2,20}$/.test(x)))].slice(0, 12) : [],
  };
}
