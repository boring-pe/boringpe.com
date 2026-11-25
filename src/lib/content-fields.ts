// Pure description of the editable public copy. No database access here, so it can be tested alone.

export type SiteId = "boringpe" | "rahulmane";

export type Field = {
  key: string;
  label: string;
  max: number;
  default: string;
  multiline?: boolean;
  email?: boolean;
  /** Optional fields may be saved empty, which hides that part of the page. */
  optional?: boolean;
  help?: string;
};

export const SITES: Record<SiteId, { label: string; where: string; path: string; fields: Field[] }> = {
  boringpe: {
    label: "Boring PE",
    where: "boringpe.com",
    path: "/",
    fields: [
      { key: "badge", label: "Top badge", max: 80, default: "Now Accepting CO-BUILD Partnerships" },
      { key: "headlineLead", label: "Headline, first part", max: 60, default: "Powering the" },
      { key: "headlineAccent", label: "Headline, highlighted part", max: 60, default: "Business Stack." },
      {
        key: "intro",
        label: "Intro paragraph",
        max: 600,
        multiline: true,
        default:
          "Boring PE is a private enterprise that builds, co-builds, and owns sustainable, cash-flowing businesses. We combine institutional capital, operational discipline, and proprietary technology to transform essential industries into enduring enterprises.",
      },
      { key: "frameworkTitle", label: "Framework title", max: 120, default: "The Unconventional Business Building Framework" },
      {
        key: "frameworkIntro",
        label: "Framework intro",
        max: 300,
        multiline: true,
        default: "Three separate activities of Boring PE: Build, Co-Build and Own. They are not Business Studio.",
      },
      { key: "buildBody", label: "Build, part of Boring PE", max: 300, multiline: true, default: "Boring PE builds businesses on its own. Build is not part of Business Studio." },
      { key: "coBuildBody", label: "Co-Build, part of Boring PE", max: 300, multiline: true, default: "Boring PE co-builds with partners. Co-Build is separate from Build and from Own." },
      { key: "ownBody", label: "Own, part of Boring PE", max: 300, multiline: true, default: "Boring PE takes ownership and holds business interests. Own is separate from Build and from Co-Build." },
      {
        key: "enableBody",
        label: "Enable, through Business Studio",
        max: 300,
        multiline: true,
        default: "Enable is not one of those three. It runs through Business Studio and supports Boring PE. It does not build, co-build or own.",
      },
      { key: "foundersTitle", label: "Founders section title", max: 120, default: "You Built It. We Protect and Scale It." },
      {
        key: "foundersBody",
        label: "Founders section text",
        max: 500,
        multiline: true,
        default:
          "A better alternative to traditional private equity or exhausting solo entrepreneurship. We respect your legacy, allow you to retain skin in the game, and plug your business into our institutional infrastructure on Day 1.",
      },
      { key: "ctaLabel", label: "Founders button label", max: 60, default: "Start a Confidential Conversation" },
      {
        key: "impactTagline",
        label: "Impact Marrow tagline",
        max: 80,
        default: "We Power Social and Economic Progress",
      },
      {
        key: "impactBody",
        label: "Impact Marrow page",
        max: 600,
        multiline: true,
        default:
          "The social and economic initiative beside Boring PE. It is funded by Rahul Mane and by Boring PE through its own fund. It is not Build, Co-Build, Own, or Studio.",
      },
      { key: "mediaBody", label: "Media page", max: 600, multiline: true, default: "Announcements from Boring PE will be published here." },
      {
        key: "aboutBody",
        label: "About Us page",
        max: 800,
        multiline: true,
        default: "Boring PE is a private enterprise. Build, Co-Build, and Own are its three activities. Studio enables them. Impact Marrow sits beside the firm.",
      },
      { key: "contactEmail", label: "Contact email", max: 254, email: true, default: "hello@boringpe.com" },
      {
        key: "footerTagline",
        label: "Footer line",
        max: 200,
        multiline: true,
        default:
          "A private enterprise that builds, co-builds, and owns sustainable businesses. Powering the Business Stack.",
      },
    ],
  },
  rahulmane: {
    label: "Rahul Mane",
    where: "rahulmane.com",
    path: "/sites/rahulmane",
    fields: [
      { key: "name", label: "Name", max: 80, default: "Rahul Mane" },
      { key: "tagline", label: "One line under the name", max: 120, default: "Owner, Boring PE" },
      {
        key: "bio",
        label: "About",
        max: 1200,
        multiline: true,
        optional: true,
        default: "",
        help: "Leave empty to hide the section. A blank line starts a new paragraph.",
      },
      {
        key: "commerceNote",
        label: "Note on commercial work",
        max: 200,
        optional: true,
        default: "All commercial work is carried out through Boring PE.",
      },
      {
        key: "contactEmail",
        label: "Contact email",
        max: 254,
        email: true,
        optional: true,
        default: "",
        help: "Leave empty to hide the contact button.",
      },
    ],
  },
};

export function isSiteId(value: unknown): value is SiteId {
  return value === "boringpe" || value === "rahulmane";
}

export function defaultsFor(site: SiteId): Record<string, string> {
  return Object.fromEntries(SITES[site].fields.map((field) => [field.key, field.default]));
}

export type Cleaned = {
  /** Values to store. Absent required fields mean "use the default". */
  values: Record<string, string>;
  /** Required fields left empty: the stored row is removed so the default applies again. */
  reset: string[];
  errors: string[];
};

/** Validates a submitted form against the field list. Unknown keys are ignored. */
export function cleanContent(site: SiteId, input: Record<string, unknown>): Cleaned {
  const values: Record<string, string> = {};
  const reset: string[] = [];
  const errors: string[] = [];
  for (const field of SITES[site].fields) {
    const raw = typeof input[field.key] === "string" ? (input[field.key] as string) : "";
    const value = (field.multiline ? raw.replace(/\r\n/g, "\n") : raw.replace(/\s+/g, " ")).trim();
    if (value.length > field.max) {
      errors.push(`${field.label} is longer than ${field.max} characters.`);
      continue;
    }
    if (value === "" && !field.optional) {
      reset.push(field.key);
      continue;
    }
    if (field.email && value !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${field.label} is not a valid email address.`);
      continue;
    }
    values[field.key] = value;
  }
  return { values, reset, errors };
}
