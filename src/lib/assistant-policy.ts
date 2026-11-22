// Pure rules for what the assistant may do on someone's behalf. No imports, so tests load it directly.

export const CATEGORIES = [
  { id: "read", label: "Look things up", note: "Search, figures, insights, tasks, agenda, mail" },
  { id: "notes", label: "Personal notes", note: "Write notes on your personal desk" },
  { id: "tasks", label: "Tasks", note: "Add and complete tasks" },
  { id: "email", label: "Send email", note: "From a mailbox you can use" },
  { id: "calendar", label: "Calendar", note: "Schedule meetings and invite people" },
  { id: "whatsapp", label: "WhatsApp", note: "Reply in WhatsApp conversations" },
  { id: "money", label: "Money", note: "Record money in and payments out" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export const isCategory = (v: unknown): v is Category => CATEGORIES.some((c) => c.id === v);

export const MODES = ["off", "ask", "auto"] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (v: unknown): v is Mode => (MODES as readonly string[]).includes(v as string);
export const MODE_LABEL: Record<Mode, string> = { off: "Not allowed", ask: "Ask first", auto: "On her own" };
const RANK: Record<Mode, number> = { off: 0, ask: 1, auto: 2 };
const lower = (a: Mode, b: Mode): Mode => (RANK[a] <= RANK[b] ? a : b);

/** The most she may ever do in a category, whatever anyone sets: money always waits for a yes. */
export const CEILING: Partial<Record<Category, Mode>> = { money: "ask" };

/** Defaults by role before anyone changes anything. */
export function defaultMode(role: string, category: Category): Mode {
  const firm = role === "super_admin" || role === "admin" || role === "partner";
  switch (category) {
    case "read":
      return "auto";
    case "notes":
      return role === "super_admin" ? "auto" : "off";
    case "tasks":
      return firm ? "auto" : "ask";
    case "money":
      return role === "super_admin" || role === "admin" ? "ask" : "off";
    default:
      return firm || role === "operator" || role === "cobuild_partner" ? "ask" : "off";
  }
}

export type Overrides = Partial<Record<Category, Mode>>;

/**
 * What she may do in a category for this person:
 * the role's setting (or default), lowered by the person's own choice, raised to "on her own" by
 * full agent mode wherever the role allows her at all, and never above the ceiling.
 */
export function effectiveMode(
  role: string,
  category: Category,
  roleSet: Overrides,
  userSet: Overrides,
  fullAgent: boolean,
): Mode {
  const roleMode = roleSet[category] ?? defaultMode(role, category);
  let mode = userSet[category] ? lower(roleMode, userSet[category]!) : roleMode;
  if (fullAgent && roleMode !== "off") mode = "auto";
  return lower(mode, CEILING[category] ?? "auto");
}

/** Whether this role may switch on full agent mode. */
export const mayRunFullAgent = (role: string, fullAgentRoles: readonly string[]) => fullAgentRoles.includes(role);
