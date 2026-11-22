// Pure rules for workspaces. No imports, so the test runner can load it directly.

export const WORKSPACES = [
  { id: "personal", label: "Personal", short: "Personal", note: "Rahul Mane, private" },
  { id: "boring_pe", label: "Boring PE", short: "Boring PE", note: "The firm and its ventures" },
  { id: "impact_marrow", label: "Impact Marrow", short: "Marrow", note: "Impact Marrow and its fund" },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]["id"];
/** What a person is looking at: one workspace, or all of them (Super Admin only). */
export type View = WorkspaceId | "all";

export const isWorkspace = (v: unknown): v is WorkspaceId => WORKSPACES.some((w) => w.id === v);
export const workspaceLabel = (id: string) => (id === "all" ? "All workspaces" : WORKSPACES.find((w) => w.id === id)?.label ?? id);

/** Workspaces anyone other than the Super Admin can be given. */
export const SHARED_WORKSPACES: WorkspaceId[] = ["boring_pe", "impact_marrow"];

/** The workspaces a seat can enter. The Super Admin enters all three; nobody else ever enters Personal. */
export function enterable(role: string, memberships: readonly string[] | null | undefined): WorkspaceId[] {
  if (role === "super_admin") return WORKSPACES.map((w) => w.id);
  const mine = new Set(memberships ?? []);
  const out = SHARED_WORKSPACES.filter((w) => mine.has(w));
  return out.length ? out : ["boring_pe"];
}

/** Views offered in the switcher: each enterable workspace, plus all of them together when there is more than one. */
export function views(role: string, memberships: readonly string[] | null | undefined): View[] {
  const list: View[] = enterable(role, memberships);
  return list.length > 1 ? [...list, "all"] : list;
}

/**
 * The view in force: the stored choice when still allowed. Until one is chosen, anyone with more than
 * one workspace sees them all together; everyone else sees their one workspace.
 */
export function resolveView(role: string, memberships: readonly string[] | null | undefined, stored: string | null | undefined): View {
  const allowed = views(role, memberships);
  if (stored && (allowed as string[]).includes(stored)) return stored as View;
  return allowed.includes("all") ? "all" : allowed[0];
}

/** The workspaces whose data a view shows. */
export function workspacesInView(view: View, role: string, memberships: readonly string[] | null | undefined): WorkspaceId[] {
  return view === "all" ? enterable(role, memberships) : [view];
}

/** Cleans a list of memberships typed into the Access page. */
export function cleanMemberships(raw: readonly unknown[]): WorkspaceId[] {
  const set = new Set(raw.filter((v): v is WorkspaceId => SHARED_WORKSPACES.includes(v as WorkspaceId)));
  return SHARED_WORKSPACES.filter((w) => set.has(w));
}

/**
 * Pages offered in each workspace. Sections not listed (the Super Admin's console, site content,
 * notifications) show everywhere they are allowed.
 */
export const SECTION_WORKSPACES: Record<string, readonly View[]> = {
  ventures: ["boring_pe", "all"],
  deals: ["boring_pe", "all"],
  marrow: ["impact_marrow", "personal", "boring_pe", "all"],
  people: ["boring_pe", "impact_marrow", "all"],
  reports: ["boring_pe", "impact_marrow", "all"],
  budgets: ["boring_pe", "impact_marrow", "personal", "all"],
  invoices: ["boring_pe", "impact_marrow", "personal", "all"],
  access: ["boring_pe", "impact_marrow", "all"],
  approvals: ["boring_pe", "impact_marrow", "all"],
  personal: ["personal", "all"],
};

export function sectionInView(section: string, view: View): boolean {
  const where = SECTION_WORKSPACES[section];
  return !where || where.includes(view);
}
