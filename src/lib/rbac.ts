export const ROLES = ["super_admin", "admin", "partner", "operator", "founder", "lp"] as const;

export type Role = (typeof ROLES)[number];

export type SectionId =
  | "console"
  | "content"
  | "dashboard"
  | "portfolio"
  | "ventures"
  | "deals"
  | "money"
  | "books"
  | "tasks"
  | "people"
  | "vault"
  | "marrow"
  | "approvals"
  | "access"
  | "personal";

export type Group = "super" | "firm" | "personal";

export const GROUPS: { id: Group; label: string }[] = [
  { id: "super", label: "Super Admin" },
  { id: "firm", label: "Boring PE" },
  { id: "personal", label: "Rahul Mane · private" },
];

export const SECTIONS: { id: SectionId; href: string; label: string; group: Group }[] = [
  { id: "console", href: "/portal/console", label: "Console", group: "super" },
  { id: "content", href: "/portal/content", label: "Site content", group: "super" },
  { id: "dashboard", href: "/portal/dashboard", label: "Dashboard", group: "firm" },
  { id: "portfolio", href: "/portal/portfolio", label: "Portfolio", group: "firm" },
  { id: "ventures", href: "/portal/ventures", label: "Ventures", group: "firm" },
  { id: "deals", href: "/portal/deals", label: "Deal Pipeline", group: "firm" },
  { id: "money", href: "/portal/money", label: "Money", group: "firm" },
  { id: "books", href: "/portal/books", label: "Books", group: "firm" },
  { id: "tasks", href: "/portal/tasks", label: "Tasks", group: "firm" },
  { id: "people", href: "/portal/people", label: "People", group: "firm" },
  { id: "vault", href: "/portal/vault", label: "BIDU Vault", group: "firm" },
  { id: "marrow", href: "/portal/marrow", label: "Impact Marrow", group: "firm" },
  { id: "approvals", href: "/portal/approvals", label: "Approvals", group: "firm" },
  { id: "access", href: "/portal/access", label: "Access", group: "firm" },
  { id: "personal", href: "/portal/personal", label: "Personal desk", group: "personal" },
];

const GRANTS: Record<Role, SectionId[]> = {
  super_admin: [
    "console", "content", "dashboard", "portfolio", "ventures", "deals", "money", "books", "tasks", "people", "vault", "marrow",
    "approvals", "access", "personal",
  ],
  admin: ["dashboard", "portfolio", "ventures", "deals", "money", "books", "tasks", "people", "vault", "marrow", "approvals", "access"],
  partner: ["dashboard", "portfolio", "ventures", "deals", "money", "books", "tasks", "people", "vault", "marrow", "approvals"],
  operator: ["dashboard", "portfolio", "ventures", "tasks", "people", "vault", "marrow", "approvals"],
  founder: ["dashboard", "marrow"],
  lp: ["dashboard", "portfolio"],
};

export const ROLE_META: Record<Role, { label: string; detail: string; initials: string }> = {
  super_admin: {
    label: "Super Admin",
    detail: "The owner. Sees and runs everything, approves requests and keeps a private desk.",
    initials: "SA",
  },
  admin: {
    label: "Admin",
    detail: "Runs Boring PE access day to day. Cannot touch other admins or the Super Admin.",
    initials: "AD",
  },
  partner: {
    label: "Partner",
    detail: "Full operating view. Cannot change access.",
    initials: "PA",
  },
  operator: {
    label: "Operator",
    detail: "Runs portfolio, vault, and impact. No deal pipeline.",
    initials: "OP",
  },
  founder: {
    label: "Founder",
    detail: "Own company dashboard and impact only.",
    initials: "FD",
  },
  lp: {
    label: "Limited Partner",
    detail: "Read-only dashboard and portfolio.",
    initials: "LP",
  },
};

const ADMIN_MAY_MANAGE: readonly Role[] = ["partner", "operator", "founder", "lp"];

/** Roles this actor may hand out. Only the Super Admin can create admins or other super admins. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "super_admin") return [...ROLES];
  if (actor === "admin") return [...ADMIN_MAY_MANAGE];
  return [];
}

/** Whether this actor may change, switch off or reset someone who currently holds `target`. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "super_admin") return true;
  if (actor === "admin") return ADMIN_MAY_MANAGE.includes(target);
  return false;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, section: SectionId) {
  return GRANTS[role].includes(section);
}

export function allowedSections(role: Role) {
  return SECTIONS.filter((section) => can(role, section.id));
}

export function firstAllowedHref(role: Role) {
  return allowedSections(role)[0]?.href ?? "/portal/dashboard";
}

/** Posting to the books is limited to the Super Admin and Admins; partners can read. */
export const canPostBooks = (role: Role) => role === "super_admin" || role === "admin";

/** Firm-wide holdings, cap tables and fund figures. External roles get scoped views later. */
export const canSeeFirmData = (role: Role) => role === "super_admin" || role === "admin" || role === "partner";
/** Adding holdings, cap table rows, income and valuations. Moving money (invest, exit, contributions) is the Super Admin's alone. */
export const canManagePortfolio = (role: Role) => role === "super_admin" || role === "admin";

/** Salaries, everyone's leave and payroll. Others see only their own record. */
export const canManagePeople = (role: Role) => role === "super_admin" || role === "admin";
