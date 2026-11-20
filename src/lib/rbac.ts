export const ROLES = ["admin", "partner", "operator", "founder", "lp"] as const;

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
  admin: {
    label: "Admin",
    detail: "Firm control. Invites people, assigns roles and opens every desk.",
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
