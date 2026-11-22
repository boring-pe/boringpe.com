export const ROLES = ["super_admin", "admin", "partner", "operator", "cobuild_partner", "founder", "lp"] as const;

export type Role = (typeof ROLES)[number];

export type SectionId =
  | "console"
  | "integrations"
  | "content"
  | "dashboard"
  | "intelligence"
  | "assistant"
  | "inbox"
  | "whatsapp"
  | "calendar"
  | "portfolio"
  | "ventures"
  | "deals"
  | "money"
  | "books"
  | "invoices"
  | "bank"
  | "assets"
  | "budgets"
  | "tasks"
  | "people"
  | "vault"
  | "marrow"
  | "reports"
  | "approvals"
  | "access"
  | "personal";

export type Group = "super" | "intelligence" | "ventures" | "infrastructure" | "personal";

export const GROUPS: { id: Group; label: string }[] = [
  { id: "super", label: "Super Admin" },
  { id: "intelligence", label: "Intelligence" },
  { id: "ventures", label: "Ventures" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "personal", label: "Rahul Mane · private" },
];

export const SECTIONS: { id: SectionId; href: string; label: string; group: Group }[] = [
  { id: "console", href: "/portal/console", label: "Console", group: "super" },
  { id: "content", href: "/portal/content", label: "Site content", group: "super" },
  // Intelligence: what the numbers say.
  { id: "dashboard", href: "/portal/dashboard", label: "Dashboard", group: "intelligence" },
  { id: "assistant", href: "/portal/assistant", label: "Assistant", group: "intelligence" },
  { id: "intelligence", href: "/portal/intelligence", label: "Insights", group: "intelligence" },
  { id: "reports", href: "/portal/reports", label: "MIS reports", group: "intelligence" },
  { id: "budgets", href: "/portal/budgets", label: "Budgets", group: "intelligence" },
  { id: "portfolio", href: "/portal/portfolio", label: "Portfolio", group: "intelligence" },
  // Ventures: the businesses being built, co-built and backed.
  { id: "ventures", href: "/portal/ventures", label: "Ventures", group: "ventures" },
  { id: "deals", href: "/portal/deals", label: "Deal Pipeline", group: "ventures" },
  { id: "marrow", href: "/portal/marrow", label: "Impact Marrow", group: "ventures" },
  { id: "tasks", href: "/portal/tasks", label: "Tasks", group: "ventures" },
  { id: "approvals", href: "/portal/approvals", label: "Approvals", group: "ventures" },
  // Infrastructure: the systems every venture runs on.
  { id: "books", href: "/portal/books", label: "Books", group: "infrastructure" },
  { id: "invoices", href: "/portal/invoices", label: "Invoices", group: "infrastructure" },
  { id: "bank", href: "/portal/bank", label: "Bank reconciliation", group: "infrastructure" },
  { id: "money", href: "/portal/money", label: "Money", group: "infrastructure" },
  { id: "assets", href: "/portal/assets", label: "Fixed assets", group: "infrastructure" },
  { id: "people", href: "/portal/people", label: "People & payroll", group: "infrastructure" },
  { id: "vault", href: "/portal/vault", label: "BIDU Vault", group: "infrastructure" },
  { id: "inbox", href: "/portal/inbox", label: "Inbox", group: "infrastructure" },
  { id: "calendar", href: "/portal/calendar", label: "Calendar", group: "infrastructure" },
  { id: "whatsapp", href: "/portal/whatsapp", label: "WhatsApp", group: "infrastructure" },
  { id: "integrations", href: "/portal/integrations", label: "Integrations", group: "infrastructure" },
  { id: "access", href: "/portal/access", label: "Access", group: "infrastructure" },
  { id: "personal", href: "/portal/personal", label: "Personal desk", group: "personal" },
];

const GRANTS: Record<Role, SectionId[]> = {
  super_admin: [
    "console", "integrations", "content", "dashboard", "assistant", "intelligence", "inbox", "calendar", "whatsapp", "portfolio", "ventures", "deals", "money", "books", "invoices", "bank", "assets", "budgets", "tasks", "people", "vault", "marrow",
    "reports", "approvals", "access", "personal",
  ],
  admin: ["dashboard", "assistant", "intelligence", "inbox", "calendar", "whatsapp", "portfolio", "ventures", "deals", "money", "books", "invoices", "bank", "assets", "budgets", "tasks", "people", "vault", "marrow", "reports", "approvals", "access"],
  partner: ["dashboard", "assistant", "intelligence", "inbox", "calendar", "whatsapp", "portfolio", "ventures", "deals", "money", "books", "invoices", "bank", "assets", "budgets", "tasks", "people", "vault", "marrow", "reports", "approvals"],
  operator: ["dashboard", "assistant", "inbox", "calendar", "portfolio", "ventures", "tasks", "people", "vault", "marrow", "approvals"],
  cobuild_partner: ["dashboard", "assistant", "inbox", "calendar", "portfolio", "ventures", "tasks", "vault"],
  founder: ["dashboard", "assistant", "inbox", "calendar", "vault", "marrow"],
  lp: ["dashboard", "assistant", "inbox", "calendar", "portfolio", "vault"],
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
    detail: "Runs a venture on revenue or profit share. Sees only their ventures, own tasks and own record.",
    initials: "OP",
  },
  cobuild_partner: {
    label: "Co-Build partner",
    detail: "Partner in a Co-Build venture or SPV. Sees only what is linked to them.",
    initials: "CB",
  },
  founder: {
    label: "Founder",
    detail: "Founder of a company we back. Sees only what is linked to them.",
    initials: "FD",
  },
  lp: {
    label: "Limited Partner",
    detail: "Investor. Sees only the SPVs and holdings linked to them.",
    initials: "LP",
  },
};

const ADMIN_MAY_MANAGE: readonly Role[] = ["partner", "operator", "cobuild_partner", "founder", "lp"];

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
