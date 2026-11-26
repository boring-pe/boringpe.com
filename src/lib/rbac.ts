export const ROLES = ["super_admin", "admin", "partner", "operator", "cobuild_partner", "founder", "lp"] as const;

export type Role = (typeof ROLES)[number];

export type SectionId =
  | "console"
  | "security"
  | "integrations"
  | "content"
  | "dashboard"
  | "intelligence"
  | "kyc"
  | "secrets"
  | "guides"
  | "v_build"
  | "v_co_build"
  | "v_own"
  | "v_studio"
  | "activity"
  | "assistant"
  | "inbox"
  | "whatsapp"
  | "calendar"
  | "portfolio"
  | "ventures"
  | "deals"
  | "parties"
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
  | "networth"
  | "approvals"
  | "access"
  | "personal";

/**
 * The menu's groups, MECE: each page answers to exactly one, and together they cover the firm.
 * Overview (what is happening) · Pipeline (who we deal with) · Verticals (what we build and own)
 * · Money (every rupee and its books) · Work (people and what they do) · Records (proof we keep)
 * · Admin (how the portal itself runs) · Personal (Rahul's own).
 */
export type Group = "overview" | "pipeline" | "verticals" | "finance" | "work" | "records" | "admin" | "personal";

export const GROUPS: { id: Group; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline & contacts" },
  { id: "verticals", label: "Verticals & holdings" },
  { id: "finance", label: "Money & books" },
  { id: "work", label: "People & work" },
  { id: "records", label: "Records & compliance" },
  { id: "admin", label: "Admin" },
  { id: "personal", label: "Rahul Mane · private" },
];

export const SECTIONS: { id: SectionId; href: string; label: string; group: Group }[] = [
  // Overview: what is happening and what needs you.
  { id: "dashboard", href: "/portal/dashboard", label: "Dashboard", group: "overview" },
  { id: "intelligence", href: "/portal/intelligence", label: "Insights", group: "overview" },
  { id: "assistant", href: "/portal/assistant", label: "Assistant", group: "overview" },
  { id: "guides", href: "/portal/guides", label: "Guides", group: "overview" },
  // Pipeline and contacts: who we deal with, and every conversation with them.
  { id: "deals", href: "/portal/deals", label: "Deal Pipeline", group: "pipeline" },
  { id: "parties", href: "/portal/parties", label: "Contacts", group: "pipeline" },
  { id: "inbox", href: "/portal/inbox", label: "Inbox", group: "pipeline" },
  { id: "whatsapp", href: "/portal/whatsapp", label: "WhatsApp", group: "pipeline" },
  { id: "calendar", href: "/portal/calendar", label: "Calendar", group: "pipeline" },
  // Verticals and holdings: what we build, co-build, own and enable.
  { id: "v_build", href: "/portal/verticals/build", label: "Build", group: "verticals" },
  { id: "v_co_build", href: "/portal/verticals/co-build", label: "Co-Build", group: "verticals" },
  { id: "v_own", href: "/portal/verticals/own", label: "Own", group: "verticals" },
  { id: "v_studio", href: "/portal/verticals/stack", label: "Boring Stack", group: "verticals" },
  { id: "ventures", href: "/portal/ventures", label: "Ventures", group: "verticals" },
  { id: "portfolio", href: "/portal/portfolio", label: "Portfolio", group: "verticals" },
  { id: "marrow", href: "/portal/marrow", label: "Impact Marrow", group: "verticals" },
  // Money and books: every rupee in or out, and what the books say about it.
  { id: "money", href: "/portal/money", label: "Money", group: "finance" },
  { id: "invoices", href: "/portal/invoices", label: "Invoices", group: "finance" },
  { id: "bank", href: "/portal/bank", label: "Bank reconciliation", group: "finance" },
  { id: "books", href: "/portal/books", label: "Books", group: "finance" },
  { id: "assets", href: "/portal/assets", label: "Fixed assets", group: "finance" },
  { id: "budgets", href: "/portal/budgets", label: "Budgets", group: "finance" },
  { id: "reports", href: "/portal/reports", label: "MIS reports", group: "finance" },
  { id: "networth", href: "/portal/networth", label: "Net worth", group: "finance" },
  // People and work: who does what, and what waits for a decision.
  { id: "tasks", href: "/portal/tasks", label: "Tasks", group: "work" },
  { id: "approvals", href: "/portal/approvals", label: "Approvals", group: "work" },
  { id: "people", href: "/portal/people", label: "People & payroll", group: "work" },
  // Records and compliance: the proof we keep.
  { id: "vault", href: "/portal/vault", label: "BIDU Vault", group: "records" },
  { id: "kyc", href: "/portal/kyc", label: "KYC", group: "records" },
  { id: "secrets", href: "/portal/secrets", label: "Password vault", group: "records" },
  // Admin: how the portal itself runs.
  { id: "console", href: "/portal/console", label: "Console", group: "admin" },
  { id: "access", href: "/portal/access", label: "Access", group: "admin" },
  { id: "security", href: "/portal/security", label: "Security", group: "admin" },
  { id: "integrations", href: "/portal/integrations", label: "Integrations", group: "admin" },
  { id: "activity", href: "/portal/activity", label: "Activity", group: "admin" },
  { id: "content", href: "/portal/content", label: "Site content", group: "admin" },
  // Rahul's own.
  { id: "personal", href: "/portal/personal", label: "Personal desk", group: "personal" },
];

const GRANTS: Record<Role, SectionId[]> = {
  super_admin: [
    "console", "security", "integrations", "content", "dashboard", "assistant", "intelligence", "inbox", "calendar", "whatsapp", "portfolio", "ventures", "deals", "parties", "money", "books", "invoices", "bank", "assets", "budgets", "tasks", "people", "vault", "marrow",
    "reports", "networth", "approvals", "access", "personal", "kyc", "secrets", "guides", "activity", "v_build", "v_co_build", "v_own", "v_studio",
  ],
  admin: ["dashboard", "assistant", "intelligence", "inbox", "calendar", "whatsapp", "portfolio", "ventures", "deals", "parties", "money", "books", "invoices", "bank", "assets", "budgets", "tasks", "people", "vault", "marrow", "reports", "networth", "approvals", "access", "kyc", "secrets", "guides", "activity", "v_build", "v_co_build", "v_own", "v_studio"],
  partner: ["dashboard", "assistant", "intelligence", "inbox", "calendar", "whatsapp", "portfolio", "ventures", "deals", "parties", "money", "books", "invoices", "bank", "assets", "budgets", "tasks", "people", "vault", "marrow", "reports", "networth", "approvals", "kyc", "secrets", "guides", "v_build", "v_co_build", "v_own", "v_studio"],
  operator: ["dashboard", "assistant", "inbox", "calendar", "portfolio", "ventures", "tasks", "people", "vault", "marrow", "approvals", "secrets", "guides"],
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

/** Where someone lands after signing in: the owner on the console, everyone else on their first page. */
export function firstAllowedHref(role: Role) {
  if (role === "super_admin") return "/portal/console";
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
