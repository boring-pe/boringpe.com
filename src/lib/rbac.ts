export const ROLES = ["superadmin", "admin", "partner", "operator", "founder", "lp"] as const;

export type Role = (typeof ROLES)[number];

export type SectionId =
  | "dashboard"
  | "portfolio"
  | "deals"
  | "vault"
  | "marrow"
  | "access";

export const SECTIONS: { id: SectionId; href: string; label: string }[] = [
  { id: "dashboard", href: "/portal/dashboard", label: "Dashboard" },
  { id: "portfolio", href: "/portal/portfolio", label: "Portfolio (SPVs)" },
  { id: "deals", href: "/portal/deals", label: "Deal Pipeline" },
  { id: "vault", href: "/portal/vault", label: "BIDU Vault" },
  { id: "marrow", href: "/portal/marrow", label: "Impact Marrow" },
  { id: "access", href: "/portal/access", label: "Access" },
];

const GRANTS: Record<Role, SectionId[]> = {
  superadmin: ["dashboard", "portfolio", "deals", "vault", "marrow", "access"],
  admin: ["dashboard", "portfolio", "deals", "vault", "marrow", "access"],
  partner: ["dashboard", "portfolio", "deals", "vault", "marrow"],
  operator: ["dashboard", "portfolio", "vault", "marrow"],
  founder: ["dashboard", "marrow"],
  lp: ["dashboard", "portfolio"],
};

export const ROLE_META: Record<
  Role,
  { label: string; detail: string; initials: string }
> = {
  superadmin: {
    label: "Super Admin",
    detail: "Current portal account. Full control, including who may assume a role.",
    initials: "SA",
  },
  admin: {
    label: "Admin",
    detail: "Opens every desk, including Access. Cannot change the Super Admin seat.",
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

export const MEMBERS: { name: string; email: string; role: Role; scope: string }[] = [
  { name: "Boring PE LLP", email: "business@boringpe.com", role: "superadmin", scope: "Firm" },
  { name: "Partner Desk", email: "partners@boringpe.com", role: "partner", scope: "Firm" },
  { name: "Desk Operator", email: "ops@boringpe.com", role: "operator", scope: "Firm" },
  { name: "Portfolio Founder", email: "founder@spv.boringpe.com", role: "founder", scope: "Own SPV" },
  { name: "Limited Partner", email: "lp@boringpe.com", role: "lp", scope: "Portfolio" },
];

export function parseRole(value: string | undefined | null): Role {
  if (value && (ROLES as readonly string[]).includes(value)) return value as Role;
  return "superadmin";
}

export function can(role: Role, section: SectionId) {
  return GRANTS[role].includes(section);
}

export function allowedSections(role: Role) {
  return SECTIONS.filter((section) => can(role, section.id));
}

export function sectionFromPath(pathname: string): SectionId | null {
  const match = SECTIONS.find(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`)
  );
  return match?.id ?? null;
}

export function firstAllowedHref(role: Role) {
  return allowedSections(role)[0]?.href ?? "/portal/dashboard";
}
