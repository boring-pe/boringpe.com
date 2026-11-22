import Link from "next/link";
import { BadgeCheck, Building2, Copy, FileCheck2, Plus, User } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { listEntities } from "@/lib/books";
import { caseChecks, caseEvents, childCases, effectiveChecks, getCase, listCases, lockerReady, type CaseRow, type CheckRow } from "@/lib/kyc";
import { CHECK_KINDS, STATUS_LABEL, STATUSES, canVerify, checkLabel, requiredChecks, type CaseStatus } from "@/lib/kyc-calc";
import { listParties } from "@/lib/ops";
import { listEmployees } from "@/lib/people";
import { addOwner, decide, openCase, reopen, review, runCheck, saveRisk, sendLink } from "./actions";

const card = "rounded-xl border border-slate-800 bg-slate-900";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const ghost = "rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  opened: { text: "Case opened. Run the checks below, or send a DigiLocker / Entity Locker link." },
  "owner-added": { text: "Beneficial owner added with their own case." },
  checked: { text: "Checked. Review the result below." },
  "check-failed": { text: "That identifier failed its check.", bad: true },
  reviewed: { text: "Review saved." },
  "link-mailed": { text: "Link emailed. You can also copy it below." },
  "link-made": { text: "Link created. Copy it below and send it to them." },
  "locker-off": { text: "Set up DigiLocker or Entity Locker under Integrations → KYC first. Until then, use a KYC provider or documents.", bad: true },
  risk: { text: "Risk updated." },
  verified: { text: "Verified. The re-KYC date is set by risk." },
  rejected: { text: "Rejected." },
  incomplete: { text: "Every required check must pass, and none may fail, before verifying.", bad: true },
  reason: { text: "Give a reason for rejecting.", bad: true },
  reopened: { text: "Reopened for a new round of checks." },
  forbidden: { text: "Only the Super Admin and Admins decide KYC cases.", bad: true },
  invalid: { text: "That was not valid.", bad: true },
};

const TONE: Record<CaseStatus, string> = {
  requested: "text-slate-400", in_progress: "text-blue-400", review: "text-amber-400", verified: "text-green-400", rejected: "text-red-400", expired: "text-red-400",
};
const CHECK_TONE: Record<CheckRow["status"], string> = { pass: "text-green-400", fail: "text-red-400", pending: "text-slate-400", review: "text-amber-400" };
const CHECK_WORD: Record<CheckRow["status"], string> = { pass: "Passed", fail: "Failed", pending: "Pending", review: "To review" };
const SOURCE: Record<string, string> = { format: "Format check", digilocker: "DigiLocker", entity_locker: "Entity Locker", provider: "KYC provider", manual: "Reviewer" };

export default async function KycPage({ searchParams }: { searchParams: Promise<{ c?: string; view?: string; status?: string; notice?: string; link?: string }> }) {
  const user = await requireSection("kyc");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const notice = banner ? (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
  ) : null;
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-400"><BadgeCheck className="h-4 w-4" />Know your customer</div>
        <h2 className="mt-2 text-2xl font-bold text-white">KYC</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Verify people and legal entities: identifiers checked here, documents shared by them from DigiLocker or Entity Locker, and a reviewer&apos;s decision. Only the last four digits of an Aadhaar number are ever kept.</p>
      </div>
      <Link href="/portal/kyc?view=new" className={`${btn} flex items-center gap-1.5`}><Plus className="h-4 w-4" />New case</Link>
    </div>
  );

  if (sp.view === "new") {
    const [parties, employees, entities] = await Promise.all([listParties(), listEmployees(), listEntities()]);
    return (
      <div className="space-y-6">
        {header}
        {notice}
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white">Open a case</h3>
          <form action={openCase} className="mt-4 grid gap-3 md:grid-cols-2">
            <select name="subjectType" className={input} aria-label="Who">
              <option value="person">A person</option>
              <option value="entity">A company, LLP, firm or trust</option>
            </select>
            <input name="name" required maxLength={160} placeholder="Full legal name, as on PAN" className={input} />
            <input name="email" type="email" maxLength={254} placeholder="Email, to send them the verification link" className={input} />
            <select name="link" defaultValue="" className={input} aria-label="Linked record">
              <option value="">Not linked to a record</option>
              <optgroup label="Contacts">{parties.map((p) => <option key={p.id} value={`party:${p.id}`}>{p.name}</option>)}</optgroup>
              <optgroup label="People">{employees.map((e) => <option key={e.id} value={`employee:${e.id}`}>{e.name}</option>)}</optgroup>
              <optgroup label="Our entities">{entities.map((e) => <option key={e.id} value={`entity:${e.id}`}>{e.name}</option>)}</optgroup>
            </select>
            <select name="company" className={input} aria-label="Registered with MCA">
              <option value="yes">Entity: company or LLP (has a CIN / LLPIN)</option>
              <option value="no">Entity: firm, trust or other (no CIN)</option>
            </select>
            <select name="gst" className={input} aria-label="GST registered">
              <option value="no">Not GST registered</option>
              <option value="yes">GST registered</option>
            </select>
            <div className="md:col-span-2"><button className={btn}>Open case</button></div>
          </form>
        </section>
      </div>
    );
  }

  if (sp.c) {
    const c = await getCase(sp.c);
    if (c) return <div className="space-y-6">{header}{notice}<CaseView c={c} role={user.role} link={sp.link} /></div>;
  }

  const cases = (await listCases()).filter((c) => !c.parent_case_id);
  const status = STATUSES.find((s) => s === sp.status);
  const shown = status ? cases.filter((c) => c.status === status) : cases;
  const count = (s: CaseStatus) => cases.filter((c) => c.status === s).length;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`;
  return (
    <div className="space-y-6">
      {header}
      {notice}
      <nav aria-label="Status" className="flex flex-wrap gap-2">
        <Link href="/portal/kyc" className={chip(!status)}>All ({cases.length})</Link>
        {STATUSES.map((s) => <Link key={s} href={`/portal/kyc?status=${s}`} className={chip(status === s)}>{STATUS_LABEL[s]} ({count(s)})</Link>)}
      </nav>
      <section className={`${card} overflow-x-auto`}>
        {shown.length === 0 ? (
          <div className="p-10 text-center">
            <FileCheck2 className="mx-auto h-8 w-8 text-slate-600" />
            <h3 className="mt-3 text-base font-semibold text-white">No cases{status ? " here" : " yet"}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Open a case for an investor, founder, vendor, employee or company before you transact with them.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3 font-medium">Who</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Risk</th><th className="px-4 py-3 font-medium">Re-KYC due</th><th className="px-4 py-3 font-medium">Updated</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-t border-slate-800" data-case={c.subject_name}>
                  <td className="px-4 py-3">
                    <Link href={`/portal/kyc?c=${c.id}`} className="flex items-center gap-2 font-medium text-white hover:text-blue-400">
                      {c.subject_type === "person" ? <User className="h-4 w-4 text-slate-500" /> : <Building2 className="h-4 w-4 text-slate-500" />}{c.subject_name}
                    </Link>
                    {c.linked_name ? <div className="text-xs text-slate-500">Linked: {c.linked_name}</div> : null}
                  </td>
                  <td className={`px-4 py-3 ${TONE[c.status]}`}>{STATUS_LABEL[c.status]}</td>
                  <td className="px-4 py-3 capitalize text-slate-300">{c.risk}</td>
                  <td className="px-4 py-3 text-slate-400">{c.rekyc_due ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{c.updated_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

async function CaseView({ c, role, link }: { c: CaseRow; role: string; link?: string }) {
  const [checks, owners, events, lockerOn] = await Promise.all([
    caseChecks(c.id), c.subject_type === "entity" ? childCases(c.id) : Promise.resolve([]), caseEvents(c.id),
    lockerReady(c.subject_type === "person" ? "digilocker" : "entity_locker"),
  ]);
  const required = requiredChecks(c.subject_type, { company: c.company, gstRegistered: c.gst_registered });
  const effective = await effectiveChecks(c);
  const ready = canVerify(required, effective);
  const decider = role === "super_admin" || role === "admin";
  const locker = c.subject_type === "person" ? "DigiLocker" : "Entity Locker";
  const kinds = CHECK_KINDS.filter((k) => (k.for as readonly string[]).includes(c.subject_type) && !["digilocker", "entity_locker", "owners", "document"].includes(k.id));
  const lastOf = (kind: string) => [...checks].reverse().find((k) => k.kind === kind);
  const ownerSum = owners.reduce((s, o) => s + (o.ownership_bps ?? 0), 0);

  return (
    <div className="space-y-6" data-case-view>
      <section className={`${card} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/portal/kyc" className="text-xs text-slate-500 hover:text-white">← All cases</Link>
            <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-white">
              {c.subject_type === "person" ? <User className="h-5 w-5 text-slate-500" /> : <Building2 className="h-5 w-5 text-slate-500" />}{c.subject_name}
            </h3>
            <p className="mt-1 text-sm text-slate-400">{c.subject_type === "person" ? "Person" : c.company ? "Company / LLP" : "Firm, trust or other"}{c.gst_registered ? " · GST registered" : ""}{c.email ? ` · ${c.email}` : ""}{c.linked_name ? ` · linked to ${c.linked_name}` : ""}</p>
          </div>
          <div className="text-right">
            <div className={`text-lg font-semibold ${TONE[c.status]}`} data-case-status>{STATUS_LABEL[c.status]}</div>
            <div className="text-xs text-slate-500">Risk: <span className="capitalize">{c.risk}</span>{c.rekyc_due ? ` · re-KYC by ${c.rekyc_due}` : ""}</div>
          </div>
        </div>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Required checks">
          {required.map((k) => {
            const s = effective.find((l) => l.kind === k)?.status;
            return (
              <li key={k} className="rounded-lg border border-slate-800 px-3 py-2" data-required={k}>
                <div className="text-sm text-white">{checkLabel(k)}</div>
                <div className={`text-xs ${s ? CHECK_TONE[s] : "text-slate-500"}`}>{s ? CHECK_WORD[s] : "Not yet"}</div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white">Share from {locker}</h3>
          <p className="mt-1 text-xs text-slate-500">They open a one-time link, sign in to {locker} themselves and consent. Government-issued documents whose name matches pass on their own.</p>
          {link ? (
            <div className="mt-3 rounded-md border border-slate-700 bg-slate-950 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400"><Copy className="h-3.5 w-3.5" />Copy and send this link</div>
              <code className="mt-1 block select-all break-all text-xs text-white" data-kyc-link>{link}</code>
            </div>
          ) : null}
          <form action={sendLink} className="mt-3">
            <input type="hidden" name="caseId" value={c.id} />
            <button className={btn} disabled={!lockerOn}>{c.email ? "Email a link" : "Create a link"}</button>
            {!lockerOn ? <span className="ml-3 text-xs text-amber-400">Set up {locker} under Integrations → KYC.</span> : null}
          </form>
        </section>

        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white">Check an identifier</h3>
          <p className="mt-1 text-xs text-slate-500">Format and checksum here; then the KYC provider, when one is set up. Results wait for a reviewer.</p>
          <form action={runCheck} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input type="hidden" name="caseId" value={c.id} />
            <select name="kind" className={input} aria-label="Identifier">{kinds.map((k) => <option key={k.id} value={k.id}>{k.label.replace(" (via DigiLocker)", "")}</option>)}</select>
            <input name="value" required maxLength={40} placeholder="Number" className={input} autoComplete="off" />
            <input name="ifsc" maxLength={20} placeholder="IFSC (bank account only)" className={`${input} sm:col-span-2`} />
            <div className="sm:col-span-2"><button className={btn}>Check</button></div>
          </form>
        </section>
      </div>

      <section className={`${card} overflow-x-auto`} data-checks>
        <div className="px-6 pt-5 text-sm font-semibold text-white">Checks</div>
        {checks.length === 0 ? <p className="px-6 py-4 text-sm text-slate-500">No checks yet.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-6 py-2 font-medium">Check</th><th className="px-4 py-2 font-medium">Value</th><th className="px-4 py-2 font-medium">Source</th><th className="px-4 py-2 font-medium">Result</th><th className="px-4 py-2 font-medium">Detail</th></tr></thead>
            <tbody>
              {checks.map((k) => (
                <tr key={k.id} className="border-t border-slate-800 align-top" data-check={`${k.kind}:${k.status}`}>
                  <td className="px-6 py-2 text-white">{checkLabel(k.kind)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-300">{k.value}</td>
                  <td className="px-4 py-2 text-slate-400">{SOURCE[k.source] ?? k.source}</td>
                  <td className={`px-4 py-2 ${CHECK_TONE[k.status]}`}>{CHECK_WORD[k.status]}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{k.detail}{k.checked_by_email ? ` · ${k.checked_by_email}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap gap-2 px-6 py-4">
          {[...new Set(checks.map((k) => k.kind))].filter((k) => lastOf(k)?.status === "review").map((k) => (
            <form key={k} action={review} className="flex items-center gap-2 rounded-lg border border-amber-500/30 px-3 py-2" data-review={k}>
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="kind" value={k} />
              <span className="text-xs text-slate-300">{checkLabel(k)}</span>
              <input name="note" maxLength={300} placeholder="Note (optional)" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
              <button name="decision" value="pass" className={ghost}>Confirm</button>
              <button name="decision" value="fail" className={ghost}>Reject</button>
            </form>
          ))}
        </div>
      </section>

      {c.subject_type === "entity" ? (
        <section className={`${card} p-6`} data-owners>
          <h3 className="text-sm font-semibold text-white">Beneficial owners</h3>
          <p className="mt-1 text-xs text-slate-500">Everyone who owns or controls 10% or more. Each gets their own case; this check passes when all are verified.{owners.length ? ` Declared so far: ${(ownerSum / 100).toFixed(2)}%.` : ""}</p>
          {owners.length ? (
            <ul className="mt-3 divide-y divide-slate-800">
              {owners.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/portal/kyc?c=${o.id}`} className="text-white hover:text-blue-400">{o.subject_name}</Link>
                  <span className="text-xs text-slate-400">{((o.ownership_bps ?? 0) / 100).toFixed(2)}% · <span className={TONE[o.status]}>{STATUS_LABEL[o.status]}</span></span>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={addOwner} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
            <input type="hidden" name="caseId" value={c.id} />
            <input name="name" required placeholder="Owner's full name" className={input} />
            <input name="email" type="email" placeholder="Email" className={input} />
            <input name="share" required placeholder="Share %" inputMode="decimal" className={input} />
            <button className={btn}>Add owner</button>
          </form>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white">Risk</h3>
          <p className="mt-1 text-xs text-slate-500">Sets the re-KYC period on verification: 2 years for high, 8 for medium, 10 for low.</p>
          <form action={saveRisk} className="mt-3 space-y-2 text-sm text-slate-300">
            <input type="hidden" name="caseId" value={c.id} />
            {([["pep", "Politically exposed person"], ["adverseMedia", "Adverse news or sanctions"], ["foreign", "Outside India"], ["cashHeavy", "Cash-heavy business"], ["trustOrAop", "Trust, AOP or layered ownership"], ["nameMismatch", "Name differs across documents"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={Boolean(c.risk_factors[k])} />{label}</label>
            ))}
            <button className={ghost}>Update risk</button>
          </form>
        </section>

        <section className={`${card} p-6`} data-decision>
          <h3 className="text-sm font-semibold text-white">Decision</h3>
          {c.status === "verified" || c.status === "rejected" || c.status === "expired" ? (
            <div className="mt-2 space-y-3 text-sm text-slate-300">
              <p>{STATUS_LABEL[c.status]}{c.verified_on ? ` on ${c.verified_on}` : ""}{c.decision_note ? `: ${c.decision_note}` : ""}</p>
              {decider ? <form action={reopen}><input type="hidden" name="caseId" value={c.id} /><button className={ghost}>Start a new round</button></form> : null}
            </div>
          ) : decider ? (
            <form action={decide} className="mt-3 space-y-3">
              <input type="hidden" name="caseId" value={c.id} />
              <input name="note" maxLength={500} placeholder="Note (needed to reject)" className={input} />
              {!ready.ok ? <p className="text-xs text-amber-400">Still needed: {ready.missing.map(checkLabel).join(", ") || "clear the failed checks"}.</p> : null}
              <div className="flex gap-2">
                <button name="decision" value="verify" className={btn} disabled={!ready.ok}>Verify</button>
                <button name="decision" value="reject" className="rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10">Reject</button>
              </div>
            </form>
          ) : <p className="mt-2 text-sm text-slate-500">The Super Admin or an Admin decides.</p>}
        </section>
      </div>

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white">History</h3>
        <ul className="mt-3 space-y-1 text-xs text-slate-400">
          {events.map((e, i) => <li key={i}>{e.created_at.slice(0, 16)} · {e.actor_email ?? "System"} · {e.action.replace(/_/g, " ")}{e.detail ? `: ${e.detail}` : ""}</li>)}
        </ul>
      </section>
    </div>
  );
}
