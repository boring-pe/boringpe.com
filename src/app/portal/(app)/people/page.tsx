import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { rupees } from "@/lib/accounting";
import { decimalToPaise, listEntities } from "@/lib/books";
import { EMPLOYMENT_TYPES, LEAVE_KINDS, employmentLabel, leaveLabel } from "@/lib/hr-calc";
import {
  employeeForUser, getEmployee, leaveUsed, linkableUsers, listEmployees, listLeave, listRuns, myPayslips, type EmployeeRow,
} from "@/lib/people";
import { canManagePeople } from "@/lib/rbac";
import { bpsLabel } from "@/lib/venture-calc";
import { addEmployee, askLeave, cancelLeave, decide, editEmployee, prepare, runAction } from "./actions";
import { StatusChip } from "../_shell/status";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  "employee-added": { text: "Employee added." },
  "employee-updated": { text: "Saved." },
  "leave-requested": { text: "Leave requested. It waits for approval." },
  "leave-withdrawn": { text: "Request withdrawn." },
  "leave-approved": { text: "Leave approved." },
  "leave-rejected": { text: "Leave rejected." },
  "run-prepared": { text: "Draft pay run ready. Check it, then post it." },
  "run-discard": { text: "Draft discarded." },
  "run-post": { text: "Pay run posted to the books." },
  "run-pay": { text: "Salaries marked paid and posted to the books." },
  "run-exists": { text: "That month already has a pay run for this entity.", bad: true },
  "run-nobody": { text: "Nobody is payable for that month in that entity.", bad: true },
  invalid: { text: "That was not valid. Check the fields.", bad: true },
  forbidden: { text: "You do not have permission for that.", bad: true },
  "user-taken": { text: "That login is already linked to someone.", bad: true },
  "no-record": { text: "You do not have an employee record yet.", bad: true },
  overlap: { text: "Those dates overlap leave you already have.", bad: true },
  balance: { text: "That is more than your remaining balance for this year.", bad: true },
  "fy-split": { text: "Split leave that crosses 31 March into two requests.", bad: true },
  "cannot-decide": { text: "That request cannot be decided (already decided, or it is your own).", bad: true },
  "books-refused": { text: "The books refused that posting.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-300";
const num = "px-3 py-2 text-sm text-right tabular-nums text-slate-200";
const r = (d: string) => rupees(decimalToPaise(d));

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ view?: string; emp?: string; notice?: string }> }) {
  const user = await requireSection("people");
  const sp = await searchParams;
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const manage = canManagePeople(user.role);
  const views = manage ? [["team", "Team"], ["leave", "Leave"], ["payroll", "Payroll"], ["me", "My record"]] : [["me", "My record"]];
  const view = views.some(([id]) => id === sp.view) ? sp.view! : manage ? "team" : "me";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">People</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          {manage ? "The team of every entity, leave, and monthly payroll that posts to the books." : "Your employee record, leave and payslips."}
        </p>
      </div>
      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p>
      ) : null}
      {views.length > 1 ? (
        <nav aria-label="People sections" className="flex gap-1 border-b border-slate-800">
          {views.map(([id, label]) => (
            <Link key={id} href={`/portal/people?view=${id}`} className={`px-4 py-2 text-sm -mb-px border-b-2 ${view === id && !sp.emp ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>{label}</Link>
          ))}
        </nav>
      ) : null}
      {manage && sp.emp ? <EmployeeDetail id={sp.emp} /> : view === "team" ? <Team /> : view === "leave" ? <Leave userId={user.id} /> : view === "payroll" ? <Payroll owner={user.role === "super_admin"} /> : <Me userId={user.id} />}
    </div>
  );
}

async function Team() {
  const [people, entities, users] = await Promise.all([listEmployees(), listEntities(), linkableUsers()]);
  return (
    <div className="space-y-8">
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={th}>Name</th><th className={th}>Entity</th><th className={th}>Role</th><th className={th}>Type</th><th className={`${th} text-right`}>Monthly gross</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {people.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-sm text-slate-500">No employees yet.</td></tr> : people.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className={td}><Link href={`/portal/people?emp=${p.id}`} className="text-blue-300 hover:text-blue-200">{p.name}</Link></td>
                <td className={td}>{p.entity_name}</td><td className={td}>{[p.designation, p.department].filter(Boolean).join(", ")}</td>
                <td className={td}>{employmentLabel(p.employment_type)}</td><td className={num}>{r(p.monthly_gross)}</td><td className={`${td} capitalize`}>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Add an employee</h3>
        <form action={addEmployee} className="grid gap-3 md:grid-cols-3">
          <input name="name" required maxLength={120} placeholder="Full name" className={input} />
          <input name="email" type="email" maxLength={200} placeholder="Work email" className={input} />
          <select name="entityId" defaultValue={entities[0]?.id} className={input} aria-label="Employer">
            {entities.map((e) => <option key={e.id} value={e.id}>Employed by {e.name}</option>)}
          </select>
          <input name="designation" maxLength={80} placeholder="Designation" className={input} />
          <input name="department" maxLength={80} placeholder="Department" className={input} />
          <select name="type" defaultValue="full_time" className={input} aria-label="Type">
            {EMPLOYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label className="text-xs text-slate-500">Joined<input name="joinDate" type="date" required className={`${input} mt-1`} /></label>
          <input name="monthlyGross" required inputMode="decimal" placeholder="Monthly gross ₹" className={input} />
          <input name="tdsPercent" inputMode="decimal" placeholder="TDS % of gross" className={input} />
          <input name="otherDeduction" inputMode="decimal" placeholder="Other deduction ₹ a month (PF etc.)" className={input} />
          <select name="userId" defaultValue="" className={input} aria-label="Portal login">
            <option value="">No portal login</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
          <div className="md:col-span-3"><button className={btn}>Add employee</button></div>
        </form>
      </section>
    </div>
  );
}

async function EmployeeDetail({ id }: { id: string }) {
  const p: EmployeeRow | null = await getEmployee(id);
  if (!p) return <p className="text-sm text-slate-500">That person was not found.</p>;
  const [slips, leave] = await Promise.all([myPayslips(p.id), listLeave(p.id)]);
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-white">{p.name}</h3>
        <p className="text-sm text-slate-400">
          {[p.designation, p.department].filter(Boolean).join(", ") || "No designation"} · {employmentLabel(p.employment_type)} · {p.entity_name} · joined {p.join_date}
          {p.exit_date ? ` · left ${p.exit_date}` : ""}{p.user_email ? ` · signs in as ${p.user_email}` : ""}
        </p>
        <p className="mt-1 text-sm text-slate-400">{r(p.monthly_gross)} a month · TDS {bpsLabel(p.tds_bps)} · other deduction {r(p.other_deduction)}</p>
      </div>
      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Update pay, role or exit</h3>
        <form action={editEmployee} className="grid gap-3 md:grid-cols-3">
          <input type="hidden" name="employeeId" value={p.id} />
          <input name="designation" defaultValue={p.designation} maxLength={80} placeholder="Designation" className={input} />
          <input name="department" defaultValue={p.department} maxLength={80} placeholder="Department" className={input} />
          <input name="monthlyGross" defaultValue={p.monthly_gross} required inputMode="decimal" className={input} aria-label="Monthly gross" />
          <input name="tdsPercent" defaultValue={(p.tds_bps / 100).toString()} inputMode="decimal" className={input} aria-label="TDS %" />
          <input name="otherDeduction" defaultValue={p.other_deduction} inputMode="decimal" className={input} aria-label="Other deduction" />
          <label className="text-xs text-slate-500">Last working day (leave blank if still here)<input name="exitDate" type="date" defaultValue={p.exit_date ?? ""} className={`${input} mt-1`} /></label>
          <div className="md:col-span-3"><button className={btn}>Save</button></div>
        </form>
      </section>
      <Payslips slips={slips} />
      <LeaveTable rows={leave} />
    </div>
  );
}

async function Leave({ userId }: { userId: string }) {
  const rows = await listLeave();
  return (
    <section className={`${card} overflow-x-auto`}>
      <table className="w-full">
        <thead><tr><th className={th}>Person</th><th className={th}>Leave</th><th className={th}>Dates</th><th className={`${th} text-right`}>Days</th><th className={th}>Reason</th><th className={th}>Status</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-sm text-slate-500">No leave requests.</td></tr> : rows.map((l) => (
            <tr key={l.id} className="border-t border-slate-800" data-leave={`${l.employee_name} ${l.from_date}`}>
              <td className={td}>{l.employee_name}</td><td className={td}>{leaveLabel(l.kind)}</td><td className={td}>{l.from_date} to {l.to_date}</td>
              <td className={num}>{l.days}</td><td className={td}>{l.reason}</td>
              <td className={td}>
                {l.status === "pending" && l.employee_user_id !== userId ? (
                  <form action={decide} className="flex gap-2">
                    <input type="hidden" name="leaveId" value={l.id} />
                    <button name="decision" value="approved" className="text-xs text-green-300 hover:text-green-200">Approve</button>
                    <button name="decision" value="rejected" className="text-xs text-red-300 hover:text-red-200">Reject</button>
                  </form>
                ) : <span className="inline-flex items-center gap-1.5"><StatusChip status={l.status} />{l.decided_by_email ? <span className="text-xs text-slate-500">by {l.decided_by_email}</span> : null}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function Payroll({ owner }: { owner: boolean }) {
  const [runs, entities] = await Promise.all([listRuns(), listEntities()]);
  const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-1">Prepare a pay run</h3>
        <p className="text-xs text-slate-500 mb-4">Pays days employed in the month, less approved unpaid leave. Posting books salary expense against salaries, TDS and deductions payable.</p>
        <form action={prepare} className="grid gap-3 md:grid-cols-3">
          <select name="entityId" defaultValue={entities[0]?.id} className={input} aria-label="Entity">
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input name="month" type="month" required defaultValue={lastMonth} className={input} aria-label="Month" />
          <button className={btn}>Prepare</button>
        </form>
      </section>
      {runs.length === 0 ? <p className="text-sm text-slate-500">No pay runs yet.</p> : null}
      {runs.map((run) => (
        <article key={run.id} className={`${card} p-4`} data-run={`${run.entity_name} ${run.period.slice(0, 7)}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-white">{run.entity_name} · {run.period.slice(0, 7)} · <span className="capitalize">{run.status}</span></div>
            <div className="text-sm text-slate-400">Gross {r(run.gross)} · TDS {r(run.tds)} · Other {r(run.other)} · Net {r(run.net)}</div>
          </div>
          <table className="mt-3 w-full">
            <thead><tr><th className={th}>Employee</th><th className={`${th} text-right`}>Days</th><th className={`${th} text-right`}>Gross</th><th className={`${th} text-right`}>TDS</th><th className={`${th} text-right`}>Other</th><th className={`${th} text-right`}>Net</th></tr></thead>
            <tbody>
              {run.slips.map((s) => (
                <tr key={s.id} className="border-t border-slate-800" data-slip={s.employee_name}>
                  <td className={td}>{s.employee_name}</td><td className={num}>{s.payable_days}/{s.days_in_month}{s.lop_days ? ` (${s.lop_days} unpaid)` : ""}</td>
                  <td className={num}>{r(s.gross)}</td><td className={num}>{r(s.tds)}</td><td className={num}>{r(s.other)}</td><td className={num}>{r(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={runAction} className="mt-3 flex gap-3">
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="date" value={today} />
            {run.status === "draft" ? (
              <>
                <button name="what" value="post" className={btn}>Post to books</button>
                <button name="what" value="discard" className="text-sm text-red-300 hover:text-red-200">Discard draft</button>
              </>
            ) : null}
            {run.status === "posted" && owner ? <button name="what" value="pay" className={btn}>Mark salaries paid</button> : null}
            {run.status === "posted" && !owner ? <span className="text-sm text-amber-400">Waiting for the Super Admin to pay</span> : null}
          </form>
        </article>
      ))}
    </div>
  );
}

async function Me({ userId }: { userId: string }) {
  const me = await employeeForUser(userId);
  if (!me) return <p className="text-sm text-slate-500">You do not have an employee record yet. Ask an Admin to link your login.</p>;
  const today = new Date().toISOString().slice(0, 10);
  const [slips, leave, used] = await Promise.all([myPayslips(me.id), listLeave(me.id), leaveUsed(me.id, today)]);
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-white">{me.name}</h3>
        <p className="text-sm text-slate-400">{[me.designation, me.department].filter(Boolean).join(", ")} · {employmentLabel(me.employment_type)} · {me.entity_name} · joined {me.join_date}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {LEAVE_KINDS.filter((k) => k.allowance !== null).map((k) => (
          <div key={k.id} className={`${card} p-4`} data-balance={k.id}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{k.label} left this year</div>
            <div className="mt-1 text-lg font-semibold text-white">{(k.allowance ?? 0) - (used[k.id] ?? 0)} of {k.allowance}</div>
          </div>
        ))}
      </div>
      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Ask for leave</h3>
        <form action={askLeave} className="grid gap-3 md:grid-cols-4">
          <select name="kind" defaultValue="casual" className={input} aria-label="Kind">
            {LEAVE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <label className="text-xs text-slate-500">From<input name="from" type="date" required className={`${input} mt-1`} /></label>
          <label className="text-xs text-slate-500">To<input name="to" type="date" required className={`${input} mt-1`} /></label>
          <input name="reason" maxLength={200} placeholder="Reason" className={input} />
          <div className="md:col-span-4"><button className={btn}>Ask for leave</button></div>
        </form>
      </section>
      <LeaveTable rows={leave} own />
      <Payslips slips={slips} />
    </div>
  );
}

function LeaveTable({ rows, own }: { rows: Awaited<ReturnType<typeof listLeave>>; own?: boolean }) {
  return (
    <section className={`${card} overflow-x-auto`}>
      <h3 className="px-3 pt-3 text-sm font-semibold text-white">Leave</h3>
      <table className="w-full">
        <tbody>
          {rows.length === 0 ? <tr><td className="px-3 py-4 text-sm text-slate-500">No leave yet.</td></tr> : rows.map((l) => (
            <tr key={l.id} className="border-t border-slate-800">
              <td className={td}>{leaveLabel(l.kind)}</td><td className={td}>{l.from_date} to {l.to_date}</td><td className={num}>{l.days} days</td>
              <td className={td}><StatusChip status={l.status} /></td>
              <td className={td}>
                {own && l.status === "pending" ? (
                  <form action={cancelLeave}><input type="hidden" name="leaveId" value={l.id} /><button className="text-xs text-slate-400 hover:text-white">Withdraw</button></form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Payslips({ slips }: { slips: Awaited<ReturnType<typeof myPayslips>> }) {
  return (
    <section className={`${card} overflow-x-auto`}>
      <h3 className="px-3 pt-3 text-sm font-semibold text-white">Payslips</h3>
      <table className="w-full">
        <thead><tr><th className={th}>Month</th><th className={`${th} text-right`}>Days</th><th className={`${th} text-right`}>Gross</th><th className={`${th} text-right`}>TDS</th><th className={`${th} text-right`}>Other</th><th className={`${th} text-right`}>Net</th><th className={th}>Status</th></tr></thead>
        <tbody>
          {slips.length === 0 ? <tr><td colSpan={7} className="px-3 py-4 text-sm text-slate-500">No payslips yet.</td></tr> : slips.map((s) => (
            <tr key={s.period} className="border-t border-slate-800" data-payslip={s.period.slice(0, 7)}>
              <td className={td}>{s.period.slice(0, 7)} · {s.entity_name}</td><td className={num}>{s.payable_days}{s.lop_days ? ` (${s.lop_days} unpaid)` : ""}</td>
              <td className={num}>{r(s.gross)}</td><td className={num}>{r(s.tds)}</td><td className={num}>{r(s.other)}</td><td className={num}>{r(s.net)}</td>
              <td className={`${td} capitalize`}>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
