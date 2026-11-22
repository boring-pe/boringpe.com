// Pure KYC rules: identifier formats and checksums, what each case needs, risk, re-KYC dates and name
// matching. No imports, so the test runner can load it directly.

export type SubjectType = "person" | "entity";
export const CHECK_KINDS = [
  { id: "pan", label: "PAN", for: ["person", "entity"] },
  { id: "aadhaar", label: "Aadhaar (via DigiLocker)", for: ["person"] },
  { id: "digilocker", label: "DigiLocker documents", for: ["person"] },
  { id: "entity_locker", label: "Entity Locker documents", for: ["entity"] },
  { id: "gstin", label: "GSTIN", for: ["entity", "person"] },
  { id: "cin", label: "CIN / LLPIN", for: ["entity"] },
  { id: "udyam", label: "Udyam registration", for: ["entity", "person"] },
  { id: "bank", label: "Bank account", for: ["person", "entity"] },
  { id: "owners", label: "Beneficial owners", for: ["entity"] },
  { id: "document", label: "Other document", for: ["person", "entity"] },
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number]["id"];
export const isCheckKind = (v: unknown): v is CheckKind => CHECK_KINDS.some((k) => k.id === v);
export const checkLabel = (id: string) => CHECK_KINDS.find((k) => k.id === id)?.label ?? id;

export const STATUSES = ["requested", "in_progress", "review", "verified", "rejected", "expired"] as const;
export type CaseStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<CaseStatus, string> = {
  requested: "Requested", in_progress: "In progress", review: "Ready for review", verified: "Verified", rejected: "Rejected", expired: "Re-KYC due",
};

export type Risk = "low" | "medium" | "high";

// ---- identifiers

export const PAN_HOLDER: Record<string, string> = {
  P: "Individual", C: "Company", H: "Hindu Undivided Family", F: "Firm / LLP", A: "Association of Persons", T: "Trust",
  B: "Body of Individuals", L: "Local authority", J: "Artificial juridical person", G: "Government",
};

export function checkPan(raw: string): { ok: boolean; value: string; holder?: string; reason?: string } {
  const v = raw.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return { ok: false, value: v, reason: "A PAN is five letters, four digits and a letter." };
  const holder = PAN_HOLDER[v[3]];
  if (!holder) return { ok: false, value: v, reason: "The fourth letter is not a known holder type." };
  return { ok: true, value: v, holder };
}

/** The holder types that fit a person, or an entity. */
export function panFits(pan: string, subject: SubjectType): boolean {
  const t = pan.toUpperCase()[3];
  return subject === "person" ? t === "P" : t !== "P";
}

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff check digit, as used by Aadhaar. */
export function verhoeffOk(digits: string): boolean {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]];
  return c === 0;
}

/** Only the last four digits of an Aadhaar number are ever kept or shown. */
export function checkAadhaar(raw: string): { ok: boolean; masked: string; reason?: string } {
  const v = raw.replace(/[\s-]/g, "");
  const masked = /^\d{4,12}$/.test(v) ? `XXXX XXXX ${v.slice(-4)}` : "";
  if (!/^[2-9]\d{11}$/.test(v)) return { ok: false, masked, reason: "An Aadhaar number is 12 digits and does not start with 0 or 1." };
  if (!verhoeffOk(v)) return { ok: false, masked, reason: "The check digit does not match." };
  return { ok: true, masked };
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function checkGstin(raw: string): { ok: boolean; value: string; pan?: string; reason?: string } {
  const g = raw.toUpperCase().replace(/\s/g, "");
  if (!/^(0[1-9]|[1-3][0-9]|97)[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return { ok: false, value: g, reason: "Not the GSTIN format." };
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  if (GSTIN_CHARS[(36 - (sum % 36)) % 36] !== g[14]) return { ok: false, value: g, reason: "The check character does not match." };
  return { ok: true, value: g, pan: g.slice(2, 12) };
}

/** Company CIN (21 characters) or LLP identification number (AAA-1234). */
export function checkCin(raw: string): { ok: boolean; value: string; kind?: "company" | "llp"; listed?: boolean; year?: number; reason?: string } {
  const v = raw.toUpperCase().replace(/\s/g, "");
  const cin = v.match(/^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/);
  if (cin) return { ok: true, value: v, kind: "company", listed: cin[1] === "L", year: Number(cin[4]) };
  if (/^[A-Z]{3}-\d{4}$/.test(v)) return { ok: true, value: v, kind: "llp" };
  return { ok: false, value: v, reason: "A CIN is 21 characters (e.g. U72900MH2020PTC123456); an LLPIN looks like AAB-1234." };
}

export function checkIfsc(raw: string) {
  const v = raw.toUpperCase().replace(/\s/g, "");
  return { ok: /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), value: v };
}
export function checkUdyam(raw: string) {
  const v = raw.toUpperCase().replace(/\s/g, "");
  return { ok: /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(v), value: v };
}
export function maskAccount(raw: string) {
  const v = raw.replace(/\s/g, "");
  return v.length > 4 ? `${"X".repeat(Math.min(8, v.length - 4))}${v.slice(-4)}` : v;
}

// ---- what a case needs

/** The checks a case must pass before it can be verified. */
export function requiredChecks(subject: SubjectType, opts: { gstRegistered?: boolean; company?: boolean } = {}): CheckKind[] {
  if (subject === "person") return ["pan", "aadhaar"];
  return ["pan", ...(opts.company === false ? [] : ["cin" as const]), ...(opts.gstRegistered ? ["gstin" as const] : []), "owners"];
}

export type CheckState = { kind: CheckKind; status: "pass" | "fail" | "pending" | "review" };

/** Where a case stands from its checks; a decided case keeps its decision. */
export function caseStatus(current: CaseStatus, required: CheckKind[], checks: CheckState[]): CaseStatus {
  if (current === "verified" || current === "rejected" || current === "expired") return current;
  if (checks.length === 0) return "requested";
  const settled = required.every((k) => checks.some((c) => c.kind === k && (c.status === "pass" || c.status === "fail" || c.status === "review")));
  return settled ? "review" : "in_progress";
}

/** May the reviewer mark it verified: every required check passed and nothing failed. */
export function canVerify(required: CheckKind[], checks: CheckState[]): { ok: boolean; missing: CheckKind[] } {
  const missing = required.filter((k) => !checks.some((c) => c.kind === k && c.status === "pass"));
  return { ok: missing.length === 0 && !checks.some((c) => c.status === "fail"), missing };
}

// ---- risk and re-KYC

export type RiskFactors = { pep?: boolean; foreign?: boolean; cashHeavy?: boolean; trustOrAop?: boolean; nameMismatch?: boolean; adverseMedia?: boolean };

/** Risk from simple factors: any two, or a politically exposed person or adverse media, is high. */
export function riskOf(f: RiskFactors): Risk {
  if (f.pep || f.adverseMedia) return "high";
  const n = [f.foreign, f.cashHeavy, f.trustOrAop, f.nameMismatch].filter(Boolean).length;
  return n >= 2 ? "high" : n === 1 ? "medium" : "low";
}

/** Periodic re-KYC, following the RBI's risk-based periods: 2 years high, 8 medium, 10 low. */
export function reKycDate(verifiedOn: string, risk: Risk): string {
  const years = risk === "high" ? 2 : risk === "medium" ? 8 : 10;
  const d = new Date(`${verifiedOn}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ---- names

const STOP = new Set(["MR", "MRS", "MS", "DR", "SHRI", "SMT", "KUMARI", "PVT", "PRIVATE", "LTD", "LIMITED", "LLP", "THE", "AND", "CO", "COMPANY"]);
const tokens = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));

/**
 * How closely two names match, 0 to 100: shared words, with initials counting for the word they
 * stand for. "Rahul S Mane" and "RAHUL SURESH MANE" score 100.
 */
export function nameScore(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return 0;
  const used = new Set<number>();
  let hit = 0;
  for (const t of x) {
    const i = y.findIndex((u, j) => !used.has(j) && (u === t || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u))));
    if (i >= 0) { used.add(i); hit++; }
  }
  return Math.round((hit / Math.max(x.length, y.length)) * 100);
}
export const NAME_MATCH = 80;
