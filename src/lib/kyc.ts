import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./db";
import { credentials, logEvent } from "./integrations";
import {
  NAME_MATCH, caseStatus, checkAadhaar, checkCin, checkGstin, checkIfsc, checkPan, checkUdyam, maskAccount, nameScore, panFits,
  reKycDate, requiredChecks, riskOf, type CaseStatus, type CheckKind, type CheckState, type RiskFactors, type SubjectType,
} from "./kyc-calc";
import { testMode } from "./test-mode";
import { workspaceContext, workspaceForNew } from "./workspaces";

export type CaseRow = {
  id: string; subject_type: SubjectType; subject_name: string; email: string | null; workspace: string;
  party_id: string | null; user_id: string | null; employee_id: string | null; entity_id: string | null;
  parent_case_id: string | null; ownership_bps: number | null; company: boolean; gst_registered: boolean;
  status: CaseStatus; risk: "low" | "medium" | "high"; risk_factors: RiskFactors; decision_note: string;
  verified_on: string | null; rekyc_due: string | null; created_at: string; updated_at: string; linked_name: string | null;
};
export type CheckRow = {
  id: string; kind: CheckKind; value: string; status: CheckState["status"]; source: string; detail: string;
  data: Record<string, unknown>; name_score: number | null; checked_by_email: string | null; created_at: string;
};

const CASE_SELECT = `
  select c.id, c.subject_type, c.subject_name, c.email, c.workspace, c.party_id, c.user_id, c.employee_id, c.entity_id,
         c.parent_case_id, c.ownership_bps, c.company, c.gst_registered, c.status, c.risk, c.risk_factors, c.decision_note,
         c.verified_on::text, c.rekyc_due::text, c.created_at::text, c.updated_at::text,
         coalesce(p.name, u.email, m.name, e.name) as linked_name
    from kyc_cases c left join parties p on p.id = c.party_id left join users u on u.id = c.user_id
    left join employees m on m.id = c.employee_id left join entities e on e.id = c.entity_id`;

/** Verified cases past their re-KYC date become due again. */
async function expireDue() {
  const sql = await getSql();
  await sql.query("update kyc_cases set status = 'expired', updated_at = now() where status = 'verified' and rekyc_due < current_date");
}

export async function listCases() {
  await expireDue();
  const sql = await getSql();
  return sql.query<CaseRow>(`${CASE_SELECT} where c.workspace = any($1::text[]) order by c.updated_at desc limit 500`, [(await workspaceContext()).inView]);
}

export async function getCase(id: string) {
  const sql = await getSql();
  return (await sql.query<CaseRow>(`${CASE_SELECT} where c.id = $1 and c.workspace = any($2::text[])`, [id, (await workspaceContext()).enterable]))[0] ?? null;
}

export async function caseChecks(caseId: string) {
  const sql = await getSql();
  return sql.query<CheckRow>(
    `select k.id::text, k.kind, k.value, k.status, k.source, k.detail, k.data, k.name_score, u.email as checked_by_email, k.created_at::text
       from kyc_checks k left join users u on u.id = k.checked_by where k.case_id = $1 order by k.created_at`,
    [caseId],
  );
}

export async function childCases(caseId: string) {
  const sql = await getSql();
  return sql.query<CaseRow>(`${CASE_SELECT} where c.parent_case_id = $1 order by c.ownership_bps desc nulls last`, [caseId]);
}

export async function caseEvents(caseId: string) {
  const sql = await getSql();
  return sql.query<{ actor_email: string | null; action: string; detail: string; created_at: string }>(
    "select actor_email, action, detail, created_at::text from kyc_events where case_id = $1 order by id desc limit 100",
    [caseId],
  );
}

async function event(caseId: string, actorEmail: string | null, action: string, detail = "") {
  const sql = await getSql();
  await sql.query("insert into kyc_events (case_id, actor_email, action, detail) values ($1, $2, $3, $4)", [caseId, actorEmail, action, detail.slice(0, 500)]);
}

export async function createCase(c: {
  subjectType: SubjectType; name: string; email: string | null; link: { party?: string; user?: string; employee?: string; entity?: string };
  company: boolean; gstRegistered: boolean; parentCaseId?: string | null; ownershipBps?: number | null; by: string; byEmail: string;
}) {
  const sql = await getSql();
  const workspace = c.parentCaseId
    ? (await sql.query<{ workspace: string }>("select workspace from kyc_cases where id = $1", [c.parentCaseId]))[0]?.workspace ?? (await workspaceForNew())
    : await workspaceForNew();
  const id = (await sql.query<{ id: string }>(
    `insert into kyc_cases (subject_type, subject_name, email, workspace, party_id, user_id, employee_id, entity_id, parent_case_id, ownership_bps,
                            company, gst_registered, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [c.subjectType, c.name, c.email, workspace, c.link.party ?? null, c.link.user ?? null, c.link.employee ?? null, c.link.entity ?? null,
      c.parentCaseId ?? null, c.ownershipBps ?? null, c.company, c.gstRegistered, c.by],
  ))[0].id;
  await event(id, c.byEmail, "opened", `${c.subjectType === "person" ? "Person" : "Entity"}: ${c.name}`);
  if (c.parentCaseId) await event(c.parentCaseId, c.byEmail, "owner_added", `${c.name}${c.ownershipBps ? `, ${(c.ownershipBps / 100).toFixed(2)}%` : ""}`);
  return id;
}

/**
 * The checks that count for a case: the latest of each kind, plus "beneficial owners" passed once
 * an entity has owners and every one of them is verified.
 */
export async function effectiveChecks(c: CaseRow): Promise<CheckState[]> {
  const latest = latestChecks(await caseChecks(c.id)).filter((l) => l.kind !== "owners");
  if (c.subject_type !== "entity") return latest;
  const owners = await childCases(c.id);
  return owners.length > 0 && owners.every((o) => o.status === "verified") ? [...latest, { kind: "owners", status: "pass" }] : latest;
}

/** Recomputes a case's status from its checks (decided cases keep their decision). */
async function refresh(caseId: string) {
  const sql = await getSql();
  const c = (await sql.query<CaseRow>(`${CASE_SELECT} where c.id = $1`, [caseId]))[0];
  if (!c) return;
  const latest = await effectiveChecks(c);
  const required = requiredChecks(c.subject_type, { company: c.company, gstRegistered: c.gst_registered });
  const next = caseStatus(c.status, required, latest);
  if (next !== c.status) await sql.query("update kyc_cases set status = $2, updated_at = now() where id = $1", [caseId, next]);
  else await sql.query("update kyc_cases set updated_at = now() where id = $1", [caseId]);
}

/** The latest result for each kind of check: a later check replaces an earlier one. */
export function latestChecks(rows: CheckRow[]): CheckState[] {
  const by = new Map<string, CheckState>();
  for (const r of rows) by.set(r.kind, { kind: r.kind, status: r.status });
  return [...by.values()];
}

async function addCheck(caseId: string, k: {
  kind: CheckKind; value: string; status: CheckRow["status"]; source: CheckRow["source"]; detail: string; data?: Record<string, unknown>; nameScore?: number | null; by: string | null;
}) {
  const sql = await getSql();
  await sql.query(
    `insert into kyc_checks (case_id, kind, value, status, source, detail, data, name_score, checked_by)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [caseId, k.kind, k.value, k.status, k.source, k.detail.slice(0, 1000), JSON.stringify(k.data ?? {}), k.nameScore ?? null, k.by],
  );
  await refresh(caseId);
}

/** Never let a full Aadhaar number or a document file reach the database through provider answers. */
function scrub(v: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof v === "string") {
    const s = v.replace(/\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g, (m) => `XXXX XXXX ${m.replace(/\s/g, "").slice(-4)}`);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  }
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrub(x, depth + 1));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !/file|pdf|image|photo|base64|xml/i.test(k)).slice(0, 60).map(([k, x]) => [k, scrub(x, depth + 1)]));
  }
  return v;
}

async function providerCall(kind: "pan" | "gstin" | "cin" | "bank", body: Record<string, string>) {
  if (testMode()) return { ok: true, data: { status: "VALID", name: body.mock_name ?? "", source: "test" } };
  const c = await credentials("kyc_provider");
  const path = c?.[`${kind}Path`];
  if (!c || !path) return null;
  const header = c.authHeader?.trim() || "Authorization";
  try {
    const res = await fetch(`${c.baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`, {
      method: "POST",
      headers: { "content-type": "application/json", [header]: header.toLowerCase() === "authorization" ? `Bearer ${c.apiKey}` : c.apiKey },
      body: JSON.stringify(Object.fromEntries(Object.entries(body).filter(([k]) => k !== "mock_name"))),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    await logEvent("kyc_provider", `check ${kind}`, res.ok, res.ok ? "answered" : `status ${res.status}`, null);
    return { ok: res.ok, data: scrub(data) as Record<string, unknown> };
  } catch (err) {
    await logEvent("kyc_provider", `check ${kind}`, false, String((err as Error).message), null);
    return { ok: false, data: { error: String((err as Error).message).slice(0, 200) } };
  }
}

/** A name somewhere in a provider's answer, for matching against the case. */
function nameIn(data: Record<string, unknown>): string | null {
  for (const k of ["name", "full_name", "registered_name", "legal_name", "company_name", "name_at_bank", "account_holder_name"]) {
    const v = data[k] ?? (data.data as Record<string, unknown> | undefined)?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * Checks one identifier: its format and checksum here, then the KYC provider when one is set up.
 * The result is for a reviewer to confirm unless a government source already confirmed it.
 */
export async function checkIdentifier(c: CaseRow, kind: "pan" | "aadhaar" | "gstin" | "cin" | "udyam" | "bank", raw: string, extra: { ifsc?: string }, by: { id: string; email: string }) {
  let value = raw.trim();
  let ok = false;
  let reason = "";
  let call: { kind: "pan" | "gstin" | "cin" | "bank"; body: Record<string, string> } | null = null;
  switch (kind) {
    case "pan": {
      const r = checkPan(raw);
      value = r.value;
      ok = r.ok && panFits(r.value, c.subject_type);
      reason = !r.ok ? r.reason! : ok ? `${r.holder} PAN` : `This PAN belongs to a ${r.holder?.toLowerCase()}, not ${c.subject_type === "person" ? "a person" : "an entity"}.`;
      call = { kind: "pan", body: { id_number: r.value, mock_name: c.subject_name } };
      break;
    }
    case "aadhaar": {
      const r = checkAadhaar(raw);
      value = r.masked;
      ok = r.ok;
      reason = r.ok ? "Valid Aadhaar number. Confirm identity through DigiLocker." : r.reason!;
      break;
    }
    case "gstin": {
      const r = checkGstin(raw);
      value = r.value;
      ok = r.ok;
      reason = r.ok ? `Valid GSTIN; PAN inside it is ${r.pan}.` : r.reason!;
      call = { kind: "gstin", body: { id_number: r.value, mock_name: c.subject_name } };
      break;
    }
    case "cin": {
      const r = checkCin(raw);
      value = r.value;
      ok = r.ok;
      reason = r.ok ? (r.kind === "llp" ? "Valid LLPIN." : `Valid CIN: ${r.listed ? "listed" : "unlisted"} company, incorporated ${r.year}.`) : r.reason!;
      call = { kind: "cin", body: { id_number: r.value, mock_name: c.subject_name } };
      break;
    }
    case "udyam": {
      const r = checkUdyam(raw);
      value = r.value;
      ok = r.ok;
      reason = r.ok ? "Valid Udyam number." : "An Udyam number looks like UDYAM-MH-26-0012345.";
      break;
    }
    case "bank": {
      const ifsc = checkIfsc(extra.ifsc ?? "");
      const acct = raw.replace(/\s/g, "");
      value = `${maskAccount(acct)} · ${ifsc.value}`;
      ok = ifsc.ok && /^\d{6,18}$/.test(acct);
      reason = ok ? "Account number and IFSC look right." : "Enter the account number (6 to 18 digits) and a valid IFSC.";
      call = { kind: "bank", body: { account_number: acct, ifsc: ifsc.value, mock_name: c.subject_name } };
      break;
    }
  }
  if (!ok) {
    await addCheck(c.id, { kind, value, status: "fail", source: "format", detail: reason, by: by.id });
    await event(c.id, by.email, "check_failed", `${kind}: ${reason}`);
    return "fail";
  }
  const answer = call ? await providerCall(call.kind, call.body) : null;
  if (answer) {
    const found = nameIn(answer.data);
    const score = found ? nameScore(found, c.subject_name) : null;
    const detail = `${reason} ${answer.ok ? "The KYC provider answered" : "The KYC provider did not confirm"}${found ? `; name on record: ${found} (${score}% match)` : ""}.`;
    await addCheck(c.id, { kind, value, status: answer.ok ? "review" : "fail", source: "provider", detail, data: answer.data, nameScore: score, by: by.id });
  } else {
    await addCheck(c.id, { kind, value, status: "review", source: "format", detail: `${reason} Confirm it against a document.`, by: by.id });
  }
  await event(c.id, by.email, "checked", `${kind} ${value}`);
  return "ok";
}

/** A reviewer confirms or rejects the latest check of a kind, or records one from a document seen. */
export async function reviewCheck(caseId: string, kind: CheckKind, pass: boolean, note: string, by: { id: string; email: string }) {
  const sql = await getSql();
  const last = (await sql.query<{ value: string }>("select value from kyc_checks where case_id = $1 and kind = $2 order by id desc limit 1", [caseId, kind]))[0];
  await addCheck(caseId, { kind, value: last?.value ?? "", status: pass ? "pass" : "fail", source: "manual", detail: note || (pass ? "Confirmed by the reviewer." : "Rejected by the reviewer."), by: by.id });
  await event(caseId, by.email, pass ? "check_confirmed" : "check_rejected", `${kind}${note ? `: ${note}` : ""}`);
}

export async function setRisk(caseId: string, factors: RiskFactors, by: { email: string }) {
  const sql = await getSql();
  const risk = riskOf(factors);
  await sql.query("update kyc_cases set risk_factors = $2::jsonb, risk = $3, updated_at = now() where id = $1", [caseId, JSON.stringify(factors), risk]);
  await event(caseId, by.email, "risk", risk);
  return risk;
}

/** The decision. Verifying needs every required check passed; it sets the re-KYC date by risk. */
export async function decideCase(c: CaseRow, verify: boolean, note: string, by: { id: string; email: string }, canVerifyNow: boolean) {
  const sql = await getSql();
  if (verify && !canVerifyNow) return "incomplete";
  const today = new Date().toISOString().slice(0, 10);
  await sql.query(
    `update kyc_cases set status = $2, decision_note = $3, decided_by = $4, verified_on = $5::date, rekyc_due = $6::date, updated_at = now() where id = $1`,
    [c.id, verify ? "verified" : "rejected", note, by.id, verify ? today : null, verify ? reKycDate(today, c.risk) : null],
  );
  await event(c.id, by.email, verify ? "verified" : "rejected", note);
  if (c.parent_case_id) await refresh(c.parent_case_id);
  return verify ? "verified" : "rejected";
}

/** Starts a fresh round on a decided or expired case, keeping the history. */
export async function reopenCase(caseId: string, by: { email: string }) {
  const sql = await getSql();
  await sql.query("update kyc_cases set status = 'in_progress', verified_on = null, rekyc_due = null, decision_note = '', updated_at = now() where id = $1", [caseId]);
  await event(caseId, by.email, "reopened");
  await refresh(caseId);
}

// ---- DigiLocker and Entity Locker consent links

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer) => b.toString("base64url");
const HOST: Record<"digilocker" | "entity_locker", string> = { digilocker: "https://api.digitallocker.gov.in", entity_locker: "https://entity.digilocker.gov.in" };

export async function lockerReady(locker: "digilocker" | "entity_locker") {
  if (testMode()) return true;
  const c = await credentials(locker);
  return Boolean(c?.clientId && c?.clientSecret);
}

/** A one-time link, valid for 7 days, that the person or entity opens to share from their locker. */
export async function createLink(c: CaseRow, by: { id: string; email: string }) {
  const locker = c.subject_type === "person" ? "digilocker" : "entity_locker";
  const token = b64url(randomBytes(24));
  const sql = await getSql();
  await sql.query(
    "insert into kyc_links (token_hash, case_id, locker, expires_at, created_by) values ($1, $2, $3, now() + interval '7 days', $4)",
    [sha(token), c.id, locker, by.id],
  );
  await event(c.id, by.email, "link_created", locker === "digilocker" ? "DigiLocker" : "Entity Locker");
  return { token, locker };
}

export async function linkByToken(token: string) {
  const sql = await getSql();
  return (await sql.query<{ case_id: string; locker: "digilocker" | "entity_locker"; used: boolean; expired: boolean; subject_name: string; subject_type: SubjectType }>(
    `select l.case_id, l.locker, (l.used_at is not null) as used, (l.expires_at < now()) as expired, c.subject_name, c.subject_type
       from kyc_links l join kyc_cases c on c.id = l.case_id where l.token_hash = $1`,
    [sha(token)],
  ))[0] ?? null;
}

/** Where to send the browser to sign in to the locker, with PKCE and a one-time state. */
export async function authorizeUrl(token: string, callback: string) {
  const link = await linkByToken(token);
  if (!link || link.used || link.expired) return null;
  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  const sql = await getSql();
  await sql.query("update kyc_links set verifier = $2, state = $3 where token_hash = $1", [sha(token), verifier, state]);
  if (testMode()) return `${callback}?code=mock&state=${state}`;
  const c = (await credentials(link.locker))!;
  const host = (c.baseUrl || HOST[link.locker]).replace(/\/+$/, "");
  const q = new URLSearchParams({
    response_type: "code", client_id: c.clientId, redirect_uri: callback, state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    purpose: "kyc",
  });
  return `${host}/public/oauth2/1/authorize?${q}`;
}

type Doc = { name?: string; doctype?: string; uri?: string; issuer?: string; date?: string };

/**
 * Back from the locker: exchanges the code, reads what was shared, and records checks on the case.
 * Government-issued documents whose name matches the case pass on their own; anything else is for review.
 */
export async function completeLocker(code: string, state: string, callback: string): Promise<"ok" | "invalid" | "failed"> {
  const sql = await getSql();
  const link = (await sql.query<{ token_hash: string; case_id: string; locker: "digilocker" | "entity_locker"; verifier: string; used: boolean; expired: boolean }>(
    "select token_hash, case_id, locker, verifier, (used_at is not null) as used, (expires_at < now()) as expired from kyc_links where state = $1",
    [state],
  ))[0];
  if (!link || link.used || link.expired || !link.verifier) return "invalid";
  await sql.query("update kyc_links set used_at = now(), state = null where token_hash = $1", [link.token_hash]);
  const c = (await sql.query<CaseRow>(`${CASE_SELECT} where c.id = $1`, [link.case_id]))[0];
  if (!c) return "invalid";

  let person: { name?: string; dob?: string; gender?: string } = {};
  let docs: Doc[] = [];
  let aadhaar: { name?: string; uidLast4?: string } | null = null;
  try {
    if (testMode() && code === "mock") {
      person = { name: c.subject_name.toUpperCase(), dob: "01-01-1990" };
      docs = link.locker === "digilocker"
        ? [{ name: "PAN Verification Record", doctype: "PANCR", uri: "in.gov.pan-PANCR-ABCPE1234F", issuer: "Income Tax Department" }, { name: "Aadhaar Card", doctype: "ADHAR", uri: "in.gov.uidai-ADHAR-xxxxxxxx1234", issuer: "UIDAI" }]
        : [{ name: "Certificate of Incorporation", doctype: "COI", uri: "in.gov.mca-COI-U72900MH2020PTC123456", issuer: "Ministry of Corporate Affairs" }, { name: "GST Registration", doctype: "GSTCR", uri: "in.gov.gst-GSTCR-27AAPFU0939F1ZV", issuer: "GSTN" }];
      if (link.locker === "digilocker") aadhaar = { name: c.subject_name.toUpperCase(), uidLast4: "1234" };
    } else {
      const cfg = (await credentials(link.locker))!;
      const host = (cfg.baseUrl || HOST[link.locker]).replace(/\/+$/, "");
      const tokenRes = await fetch(`${host}/public/oauth2/1/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: callback, code_verifier: link.verifier }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
      const tok = (await tokenRes.json()) as { access_token: string; name?: string; dob?: string; gender?: string };
      const auth = { Authorization: `Bearer ${tok.access_token}` };
      const get = async (path: string) => {
        const r = await fetch(`${host}${path}`, { headers: auth, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new Error(`${path} ${r.status}`);
        return r;
      };
      if (link.locker === "digilocker") {
        const u = (await (await get("/public/oauth2/1/user")).json()) as { name?: string; dob?: string; gender?: string };
        person = { name: u.name ?? tok.name, dob: u.dob ?? tok.dob, gender: u.gender ?? tok.gender };
        docs = (((await (await get("/public/oauth2/2/files/issued")).json()) as { items?: Doc[] }).items ?? []);
        try {
          const xml = await (await get("/public/oauth2/3/xml/eaadhaar")).text();
          const name = xml.match(/<Poi[^>]*\bname="([^"]+)"/i)?.[1];
          const uid = xml.match(/\buid="([^"]+)"/i)?.[1]?.replace(/\D/g, "").slice(-4);
          aadhaar = { name, uidLast4: uid };
        } catch {
          aadhaar = null;
        }
      } else {
        const e = (await (await get("/public/oauth2/1/entity")).json()) as Record<string, unknown>;
        person = { name: String(e.name ?? e.entity_name ?? e.legal_name ?? "") };
        docs = (((await (await get("/public/oauth2/2/entity/files/issued")).json()) as { items?: Doc[] }).items ?? []);
      }
    }
  } catch (err) {
    await event(c.id, null, "locker_failed", String((err as Error).message).slice(0, 200));
    await logEvent(link.locker, "kyc consent", false, String((err as Error).message), null);
    return "failed";
  }

  const shared = docs.slice(0, 50).map((d) => ({ name: d.name, doctype: d.doctype, issuer: d.issuer, date: d.date }));
  const lockerName = person.name ?? "";
  const score = lockerName ? nameScore(lockerName, c.subject_name) : null;
  const matches = score !== null && score >= NAME_MATCH;
  const source = link.locker;
  await addCheck(c.id, {
    kind: link.locker === "digilocker" ? "digilocker" : "entity_locker", value: `${shared.length} documents shared`,
    status: matches ? "pass" : "review", source,
    detail: `Signed in to ${link.locker === "digilocker" ? "DigiLocker" : "Entity Locker"} as ${lockerName || "unknown"}${score !== null ? ` (${score}% name match)` : ""}.`,
    data: scrub({ name: lockerName, dob: person.dob, gender: person.gender, documents: shared }) as Record<string, unknown>, nameScore: score, by: null,
  });
  // Identifiers inside the document URIs (e.g. in.gov.pan-PANCR-ABCDE1234F) confirm the matching checks.
  const fromUri = (re: RegExp) => docs.map((d) => d.uri?.match(re)?.[1]).find(Boolean);
  const pan = fromUri(/PANCR-([A-Z]{5}\d{4}[A-Z])/i);
  if (pan) await addCheck(c.id, { kind: "pan", value: pan.toUpperCase(), status: matches ? "pass" : "review", source, detail: "PAN record issued by the Income Tax Department, shared from the locker.", nameScore: score, by: null });
  const gstin = fromUri(/GSTCR-([0-9A-Z]{15})/i);
  if (gstin) await addCheck(c.id, { kind: "gstin", value: gstin.toUpperCase(), status: matches && checkGstin(gstin).ok ? "pass" : "review", source, detail: "GST registration shared from the locker.", nameScore: score, by: null });
  const cin = fromUri(/COI-([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})/i);
  if (cin) await addCheck(c.id, { kind: "cin", value: cin.toUpperCase(), status: matches ? "pass" : "review", source, detail: "Certificate of incorporation from the Ministry of Corporate Affairs, shared from the locker.", nameScore: score, by: null });
  if (aadhaar) {
    const aScore = aadhaar.name ? nameScore(aadhaar.name, c.subject_name) : null;
    await addCheck(c.id, {
      kind: "aadhaar", value: aadhaar.uidLast4 ? `XXXX XXXX ${aadhaar.uidLast4}` : "masked", status: aScore !== null && aScore >= NAME_MATCH ? "pass" : "review", source,
      detail: `e-Aadhaar from UIDAI through DigiLocker${aScore !== null ? `, ${aScore}% name match` : ""}. Only the last four digits are kept.`, nameScore: aScore, by: null,
    });
  }
  await event(c.id, null, "locker_shared", `${shared.length} documents from ${link.locker === "digilocker" ? "DigiLocker" : "Entity Locker"}`);
  return "ok";
}
