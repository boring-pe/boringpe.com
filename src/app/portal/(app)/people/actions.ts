"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { parsePaise } from "@/lib/accounting";
import { listEntities } from "@/lib/books";
import { daysBetween, fiscalYearOf, isEmploymentType, isLeaveKind } from "@/lib/hr-calc";
import { oneLine, parseDate } from "@/lib/ops-fields";
import {
  createEmployee, decideLeave, discardRun, employeeForUser, getEmployee, linkableUsers, payRun, postRun, prepareRun,
  requestLeave, updateEmployee, withdrawLeave,
} from "@/lib/people";
import { canManagePeople } from "@/lib/rbac";
import { audit } from "@/lib/users";
import { parseMonth, parsePercent } from "@/lib/venture-calc";

function back(query: string, notice: string): never {
  redirect(`/portal/people?${query}${query ? "&" : ""}notice=${notice}`);
}
const today = () => new Date().toISOString().slice(0, 10);

async function manager() {
  const user = await requireSection("people");
  if (!canManagePeople(user.role)) back("", "forbidden");
  return user;
}

export async function addEmployee(formData: FormData) {
  const user = await manager();
  const name = oneLine(formData.get("name"), 120);
  const emailRaw = oneLine(formData.get("email"), 200).toLowerCase();
  const entityId = String(formData.get("entityId") ?? "");
  const type = formData.get("type");
  const joinDate = parseDate(formData.get("joinDate"));
  const gross = parsePaise(String(formData.get("monthlyGross") ?? ""));
  const tds = parsePercent(String(formData.get("tdsPercent") ?? "") || "0");
  const other = parsePaise(String(formData.get("otherDeduction") ?? ""));
  const userId = String(formData.get("userId") ?? "");
  if (name.length < 2 || !isEmploymentType(type) || !joinDate || !gross || tds === null || other === null) back("view=team", "invalid");
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) back("view=team", "invalid");
  if (!(await listEntities()).some((e) => e.id === entityId)) back("view=team", "invalid");
  if (userId && !(await linkableUsers()).some((u) => u.id === userId)) back("view=team", "user-taken");
  const id = await createEmployee({
    name, email: emailRaw || null, userId: userId || null, entityId, type, joinDate, monthlyGross: gross, tdsBps: tds,
    otherDeduction: other, department: oneLine(formData.get("department"), 80), designation: oneLine(formData.get("designation"), 80), by: user.id,
  });
  if (id === "user-taken") back("view=team", "user-taken");
  await audit({ actorId: user.id, actorEmail: user.email, action: "employee_added", detail: name });
  back(`emp=${id}`, "employee-added");
}

export async function editEmployee(formData: FormData) {
  const user = await manager();
  const emp = await getEmployee(String(formData.get("employeeId") ?? ""));
  if (!emp) back("view=team", "invalid");
  const q = `emp=${emp.id}`;
  const gross = parsePaise(String(formData.get("monthlyGross") ?? ""));
  const tds = parsePercent(String(formData.get("tdsPercent") ?? "") || "0");
  const other = parsePaise(String(formData.get("otherDeduction") ?? ""));
  const exitRaw = String(formData.get("exitDate") ?? "");
  const exitDate = exitRaw ? parseDate(exitRaw) : null;
  if (gross === null || tds === null || other === null || (exitRaw && !exitDate)) back(q, "invalid");
  const ok = await updateEmployee(emp.id, {
    department: oneLine(formData.get("department"), 80), designation: oneLine(formData.get("designation"), 80),
    monthlyGross: gross, tdsBps: tds, otherDeduction: other, exitDate,
  });
  if (!ok) back(q, "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: "employee_updated", detail: emp.name });
  back(q, "employee-updated");
}

/** Anyone with an employee record asks for their own leave. */
export async function askLeave(formData: FormData) {
  const user = await requireSection("people");
  const me = await employeeForUser(user.id);
  if (!me) back("", "no-record");
  const kind = formData.get("kind");
  const from = parseDate(formData.get("from"));
  const to = parseDate(formData.get("to"));
  const reason = oneLine(formData.get("reason"), 200);
  if (!isLeaveKind(kind) || !from || !to || to < from) back("", "invalid");
  if (fiscalYearOf(from)[0] !== fiscalYearOf(to)[0]) back("", "fy-split");
  const days = daysBetween(from, to);
  if (days > 180) back("", "invalid");
  const result = await requestLeave({ employeeId: me.id, kind, from, to, days, reason, by: user.id });
  if (result !== "ok") back("", result);
  await audit({ actorId: user.id, actorEmail: user.email, action: "leave_requested", detail: `${kind} ${from} to ${to}` });
  back("", "leave-requested");
}

export async function cancelLeave(formData: FormData) {
  const user = await requireSection("people");
  const me = await employeeForUser(user.id);
  if (!me || !(await withdrawLeave(String(formData.get("leaveId") ?? ""), me.id))) back("", "invalid");
  back("", "leave-withdrawn");
}

export async function decide(formData: FormData) {
  const user = await manager();
  const decision = formData.get("decision");
  if (decision !== "approved" && decision !== "rejected") back("view=leave", "invalid");
  const ok = await decideLeave(String(formData.get("leaveId") ?? ""), decision, user.id);
  if (!ok) back("view=leave", "cannot-decide");
  await audit({ actorId: user.id, actorEmail: user.email, action: `leave_${decision}` });
  back("view=leave", `leave-${decision}`);
}

export async function prepare(formData: FormData) {
  const user = await manager();
  const entityId = String(formData.get("entityId") ?? "");
  const period = parseMonth(formData.get("month"));
  if (!period || !(await listEntities()).some((e) => e.id === entityId)) back("view=payroll", "invalid");
  const result = await prepareRun(entityId, period, user.id);
  if (result !== "ok") back("view=payroll", `run-${result}`);
  await audit({ actorId: user.id, actorEmail: user.email, action: "payrun_prepared", detail: period.slice(0, 7) });
  back("view=payroll", "run-prepared");
}

export async function runAction(formData: FormData) {
  const user = await manager();
  const id = String(formData.get("runId") ?? "");
  const what = formData.get("what");
  let ok = false;
  try {
    if (what === "discard") ok = await discardRun(id);
    else if (what === "post") ok = await postRun(id, user.id);
    else if (what === "pay") {
      // Paying salaries moves money: the Super Admin's.
      if (user.role !== "super_admin") back("view=payroll", "forbidden");
      ok = await payRun(id, parseDate(formData.get("date")) ?? today(), user.id);
    }
  } catch {
    back("view=payroll", "books-refused");
  }
  if (!ok) back("view=payroll", "invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: `payrun_${String(what)}`, detail: id });
  back("view=payroll", `run-${String(what)}`);
}
