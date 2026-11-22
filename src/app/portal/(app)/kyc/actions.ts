"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { baseUrl } from "@/lib/base-url";
import {
  checkIdentifier, createCase, createLink, decideCase, effectiveChecks, getCase, lockerReady, reopenCase, reviewCheck, setRisk,
} from "@/lib/kyc";
import { canVerify, isCheckKind, requiredChecks, type RiskFactors } from "@/lib/kyc-calc";
import { emailExternal } from "@/lib/notify";
import { audit } from "@/lib/users";

function go(q: string): never {
  redirect(`/portal/kyc${q ? `?${q}` : ""}`);
}
const line = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const deciders = ["super_admin", "admin"];

async function reviewer() {
  return requireSection("kyc");
}

async function caseOr404(id: string) {
  const c = await getCase(id);
  if (!c) go("notice=invalid");
  return c;
}

export async function openCase(formData: FormData) {
  const user = await reviewer();
  const subject = formData.get("subjectType") === "entity" ? "entity" : "person";
  const name = line(formData.get("name"), 160);
  const email = line(formData.get("email"), 254).toLowerCase() || null;
  if (name.length < 2 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) go("view=new&notice=invalid");
  const link = String(formData.get("link") ?? "");
  const [type, id] = link.includes(":") ? link.split(":") : ["", ""];
  const caseId = await createCase({
    subjectType: subject, name, email,
    link: type === "party" ? { party: id } : type === "employee" ? { employee: id } : type === "entity" ? { entity: id } : type === "user" ? { user: id } : {},
    company: formData.get("company") !== "no", gstRegistered: formData.get("gst") === "yes", by: user.id, byEmail: user.email,
  });
  await audit({ actorId: user.id, actorEmail: user.email, action: "kyc_opened", detail: name });
  go(`c=${caseId}&notice=opened`);
}

export async function addOwner(formData: FormData) {
  const user = await reviewer();
  const parent = await caseOr404(String(formData.get("caseId") ?? ""));
  const name = line(formData.get("name"), 160);
  const share = Number(String(formData.get("share") ?? "").replace("%", ""));
  if (name.length < 2 || !(share > 0 && share <= 100)) go(`c=${parent.id}&notice=invalid`);
  const email = line(formData.get("email"), 254).toLowerCase() || null;
  await createCase({ subjectType: "person", name, email, link: {}, company: true, gstRegistered: false, parentCaseId: parent.id, ownershipBps: Math.round(share * 100), by: user.id, byEmail: user.email });
  go(`c=${parent.id}&notice=owner-added`);
}

export async function runCheck(formData: FormData) {
  const user = await reviewer();
  const c = await caseOr404(String(formData.get("caseId") ?? ""));
  const kind = String(formData.get("kind") ?? "");
  if (!["pan", "aadhaar", "gstin", "cin", "udyam", "bank"].includes(kind)) go(`c=${c.id}&notice=invalid`);
  const r = await checkIdentifier(c, kind as "pan", String(formData.get("value") ?? "").slice(0, 40), { ifsc: line(formData.get("ifsc"), 20) }, { id: user.id, email: user.email });
  go(`c=${c.id}&notice=${r === "fail" ? "check-failed" : "checked"}`);
}

export async function review(formData: FormData) {
  const user = await reviewer();
  const c = await caseOr404(String(formData.get("caseId") ?? ""));
  const kind = formData.get("kind");
  if (!isCheckKind(kind)) go(`c=${c.id}&notice=invalid`);
  await reviewCheck(c.id, kind, formData.get("decision") === "pass", line(formData.get("note"), 300), { id: user.id, email: user.email });
  go(`c=${c.id}&notice=reviewed`);
}

export async function sendLink(formData: FormData) {
  const user = await reviewer();
  const c = await caseOr404(String(formData.get("caseId") ?? ""));
  const locker = c.subject_type === "person" ? "digilocker" : "entity_locker";
  if (!(await lockerReady(locker))) go(`c=${c.id}&notice=locker-off`);
  const { token } = await createLink(c, { id: user.id, email: user.email });
  const url = `${await baseUrl()}/portal/verify/${token}`;
  const mailed = c.email
    ? await emailExternal(c.email, "Boring PE: please verify your details", `Boring PE asks you to share documents from your ${locker === "digilocker" ? "DigiLocker" : "Entity Locker"} to complete KYC. The link works once and expires in seven days.`, url)
    : false;
  await audit({ actorId: user.id, actorEmail: user.email, action: "kyc_link", detail: c.subject_name });
  redirect(`/portal/kyc?c=${c.id}&notice=${mailed ? "link-mailed" : "link-made"}&link=${encodeURIComponent(url)}`);
}

export async function saveRisk(formData: FormData) {
  const user = await reviewer();
  const c = await caseOr404(String(formData.get("caseId") ?? ""));
  const f: RiskFactors = Object.fromEntries(["pep", "foreign", "cashHeavy", "trustOrAop", "nameMismatch", "adverseMedia"].map((k) => [k, formData.get(k) === "on"]));
  await setRisk(c.id, f, { email: user.email });
  go(`c=${c.id}&notice=risk`);
}

export async function decide(formData: FormData) {
  const user = await reviewer();
  if (!deciders.includes(user.role)) go("notice=forbidden");
  const c = await caseOr404(String(formData.get("caseId") ?? ""));
  const verify = formData.get("decision") === "verify";
  const note = line(formData.get("note"), 500);
  if (!verify && note.length < 3) go(`c=${c.id}&notice=reason`);
  const required = requiredChecks(c.subject_type, { company: c.company, gstRegistered: c.gst_registered });
  const ok = canVerify(required, await effectiveChecks(c)).ok;
  const r = await decideCase(c, verify, note, { id: user.id, email: user.email }, ok);
  await audit({ actorId: user.id, actorEmail: user.email, action: `kyc_${r}`, detail: c.subject_name });
  go(`c=${c.id}&notice=${r}`);
}

export async function reopen(formData: FormData) {
  const user = await reviewer();
  if (!deciders.includes(user.role)) go("notice=forbidden");
  const c = await caseOr404(String(formData.get("caseId") ?? ""));
  await reopenCase(c.id, { email: user.email });
  go(`c=${c.id}&notice=reopened`);
}
