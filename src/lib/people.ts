import { getSql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, postByCodes } from "./books";
import {
  LEAVE_KINDS, daysInMonth, fiscalYearOf, overlapDays, payslip, rangesOverlap, type EmploymentType, type LeaveKind,
} from "./hr-calc";
import { monthEnd } from "./venture-calc";

export type EmployeeRow = {
  id: string; name: string; email: string | null; user_id: string | null; user_email: string | null;
  entity_id: string; entity_name: string; department: string; designation: string; employment_type: EmploymentType;
  join_date: string; exit_date: string | null; monthly_gross: string; tds_bps: number; other_deduction: string; status: "active" | "exited";
};
export type LeaveRow = {
  id: string; employee_id: string; employee_name: string; employee_user_id: string | null; kind: LeaveKind;
  from_date: string; to_date: string; days: number; reason: string; status: string; decided_by_email: string | null;
};
export type RunRow = {
  id: string; entity_id: string; entity_name: string; period: string; status: "draft" | "posted" | "paid";
  gross: string; tds: string; other: string; net: string;
  slips: { id: string; employee_id: string; employee_name: string; payable_days: number; days_in_month: number; lop_days: number; gross: string; tds: string; other: string; net: string }[];
};

const EMP_SELECT = `
  select m.id, m.name, m.email, m.user_id, u.email as user_email, m.entity_id, e.name as entity_name, m.department,
         m.designation, m.employment_type, m.join_date::text, m.exit_date::text, m.monthly_gross::text, m.tds_bps,
         m.other_deduction::text, m.status
    from employees m join entities e on e.id = m.entity_id left join users u on u.id = m.user_id`;

export async function listEmployees() {
  const sql = await getSql();
  return sql.query<EmployeeRow>(`${EMP_SELECT} order by m.status, m.name`);
}
export async function getEmployee(id: string) {
  const sql = await getSql();
  return (await sql.query<EmployeeRow>(`${EMP_SELECT} where m.id = $1`, [id]))[0] ?? null;
}
export async function employeeForUser(userId: string) {
  const sql = await getSql();
  return (await sql.query<EmployeeRow>(`${EMP_SELECT} where m.user_id = $1`, [userId]))[0] ?? null;
}
/** Active portal users not yet linked to an employee record. */
export async function linkableUsers() {
  const sql = await getSql();
  return sql.query<{ id: string; email: string }>(
    `select u.id, u.email from users u where u.status = 'active'
        and not exists (select 1 from employees m where m.user_id = u.id) order by u.email`,
  );
}

export async function createEmployee(e: {
  name: string; email: string | null; userId: string | null; entityId: string; department: string; designation: string;
  type: EmploymentType; joinDate: string; monthlyGross: bigint; tdsBps: number; otherDeduction: bigint; by: string;
}): Promise<string | "user-taken"> {
  const sql = await getSql();
  try {
    const rows = await sql.query<{ id: string }>(
      `insert into employees (name, email, user_id, entity_id, department, designation, employment_type, join_date,
                              monthly_gross, tds_bps, other_deduction, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12) returning id`,
      [e.name, e.email, e.userId, e.entityId, e.department, e.designation, e.type, e.joinDate,
        paiseToDecimal(e.monthlyGross), e.tdsBps, paiseToDecimal(e.otherDeduction), e.by],
    );
    return rows[0].id;
  } catch (err) {
    if (/duplicate key|unique/i.test(String((err as Error).message))) return "user-taken";
    throw err;
  }
}

/** Changes pay and role details. Setting an exit date marks the person exited. */
export async function updateEmployee(id: string, u: {
  department: string; designation: string; monthlyGross: bigint; tdsBps: number; otherDeduction: bigint; exitDate: string | null;
}): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query(
    `update employees set department = $2, designation = $3, monthly_gross = $4, tds_bps = $5, other_deduction = $6,
            exit_date = $7::date, status = case when $7::date is null then 'active' else 'exited' end
      where id = $1 and ($7::date is null or $7::date >= join_date) returning id`,
    [id, u.department, u.designation, paiseToDecimal(u.monthlyGross), u.tdsBps, paiseToDecimal(u.otherDeduction), u.exitDate],
  );
  return rows.length > 0;
}

// ---- leave

const LEAVE_SELECT = `
  select l.id, l.employee_id, m.name as employee_name, m.user_id as employee_user_id, l.kind, l.from_date::text,
         l.to_date::text, l.days, l.reason, l.status, u.email as decided_by_email
    from leave_requests l join employees m on m.id = l.employee_id left join users u on u.id = l.decided_by`;

export async function listLeave(employeeId?: string) {
  const sql = await getSql();
  return employeeId
    ? sql.query<LeaveRow>(`${LEAVE_SELECT} where l.employee_id = $1 order by l.from_date desc`, [employeeId])
    : sql.query<LeaveRow>(`${LEAVE_SELECT} order by (l.status = 'pending') desc, l.from_date desc limit 200`);
}

/** Days used or asked for (approved and pending) per kind in the financial year containing `date`. */
export async function leaveUsed(employeeId: string, date: string): Promise<Record<string, number>> {
  const sql = await getSql();
  const [from, to] = fiscalYearOf(date);
  const rows = await sql.query<{ kind: string; days: number }>(
    `select kind, sum(days)::int as days from leave_requests
      where employee_id = $1 and status in ('approved', 'pending') and from_date between $2::date and $3::date group by kind`,
    [employeeId, from, to],
  );
  return Object.fromEntries(rows.map((r) => [r.kind, r.days]));
}

export async function requestLeave(r: {
  employeeId: string; kind: LeaveKind; from: string; to: string; days: number; reason: string; by: string;
}): Promise<"ok" | "overlap" | "balance"> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    await db.query("select id from employees where id = $1 for update", [r.employeeId]);
    const existing = await db.query<{ from_date: string; to_date: string }>(
      "select from_date::text, to_date::text from leave_requests where employee_id = $1 and status in ('approved', 'pending')",
      [r.employeeId],
    );
    if (existing.some((x) => rangesOverlap([x.from_date, x.to_date], [r.from, r.to]))) return "overlap" as const;
    const allowance = LEAVE_KINDS.find((k) => k.id === r.kind)?.allowance ?? null;
    if (allowance !== null) {
      const [fyFrom, fyTo] = fiscalYearOf(r.from);
      const used = (await db.query<{ days: number }>(
        `select coalesce(sum(days), 0)::int as days from leave_requests
          where employee_id = $1 and kind = $2 and status in ('approved', 'pending') and from_date between $3::date and $4::date`,
        [r.employeeId, r.kind, fyFrom, fyTo],
      ))[0].days;
      if (used + r.days > allowance) return "balance" as const;
    }
    await db.query(
      `insert into leave_requests (employee_id, kind, from_date, to_date, days, reason, requested_by)
       values ($1, $2, $3::date, $4::date, $5, $6, $7)`,
      [r.employeeId, r.kind, r.from, r.to, r.days, r.reason, r.by],
    );
    return "ok" as const;
  });
}

/** Approve or reject a pending request. Nobody decides their own leave. */
export async function decideLeave(id: string, decision: "approved" | "rejected", deciderId: string) {
  const sql = await getSql();
  const rows = await sql.query(
    `update leave_requests l set status = $2, decided_by = $3, decided_at = now()
       from employees m
      where l.id = $1 and l.status = 'pending' and m.id = l.employee_id and m.user_id is distinct from $3
      returning l.id`,
    [id, decision, deciderId],
  );
  return rows.length > 0;
}

export async function withdrawLeave(id: string, employeeId: string) {
  const sql = await getSql();
  const rows = await sql.query(
    "update leave_requests set status = 'withdrawn' where id = $1 and employee_id = $2 and status = 'pending' returning id",
    [id, employeeId],
  );
  return rows.length > 0;
}

// ---- payroll

const RUN_SELECT = `
  select r.id, r.entity_id, e.name as entity_name, r.period::text, r.status, r.gross::text, r.tds::text, r.other::text, r.net::text,
         coalesce((select json_agg(json_build_object('id', s.id, 'employee_id', s.employee_id, 'employee_name', m.name,
                     'payable_days', s.payable_days, 'days_in_month', s.days_in_month, 'lop_days', s.lop_days,
                     'gross', s.gross::text, 'tds', s.tds::text, 'other', s.other::text, 'net', s.net::text) order by m.name)
                   from payslips s join employees m on m.id = s.employee_id where s.pay_run_id = r.id), '[]'::json) as slips
    from pay_runs r join entities e on e.id = r.entity_id`;

export async function listRuns() {
  const sql = await getSql();
  return sql.query<RunRow>(`${RUN_SELECT} order by r.period desc, e.name limit 36`);
}

/** Payslips of posted or paid runs for one employee. */
export async function myPayslips(employeeId: string) {
  const sql = await getSql();
  return sql.query<{ period: string; entity_name: string; status: string; payable_days: number; lop_days: number; gross: string; tds: string; other: string; net: string }>(
    `select r.period::text, e.name as entity_name, r.status, s.payable_days, s.lop_days, s.gross::text, s.tds::text, s.other::text, s.net::text
       from payslips s join pay_runs r on r.id = s.pay_run_id join entities e on e.id = r.entity_id
      where s.employee_id = $1 and r.status in ('posted', 'paid') order by r.period desc`,
    [employeeId],
  );
}

/** Builds a draft pay run for one entity and month from its employees and their approved unpaid leave. */
export async function prepareRun(entityId: string, period: string, by: string): Promise<"ok" | "exists" | "nobody"> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    await db.query("select id from entities where id = $1 for update", [entityId]);
    if ((await db.query("select 1 from pay_runs where entity_id = $1 and period = $2::date", [entityId, period])).length) {
      return "exists" as const;
    }
    const end = monthEnd(period);
    const people = await db.query<{ id: string; join_date: string; exit_date: string | null; monthly_gross: string; tds_bps: number; other_deduction: string }>(
      `select id, join_date::text, exit_date::text, monthly_gross::text, tds_bps, other_deduction::text from employees
        where entity_id = $1 and join_date <= $3::date and (exit_date is null or exit_date >= $2::date)`,
      [entityId, period, end],
    );
    const unpaid = await db.query<{ employee_id: string; from_date: string; to_date: string }>(
      `select employee_id, from_date::text, to_date::text from leave_requests
        where kind = 'unpaid' and status = 'approved' and from_date <= $2::date and to_date >= $1::date`,
      [period, end],
    );
    const slips = people
      .map((p) => {
        const lop = unpaid.filter((l) => l.employee_id === p.id).reduce((s, l) => s + overlapDays(l.from_date, l.to_date, period), 0);
        return { id: p.id, ...payslip({
          monthlyGross: decimalToPaise(p.monthly_gross), tdsBps: p.tds_bps, otherDeduction: decimalToPaise(p.other_deduction),
          joinDate: p.join_date, exitDate: p.exit_date, lopDays: lop,
        }, period), monthly: p.monthly_gross };
      })
      .filter((s) => s.gross > 0n);
    if (slips.length === 0) return "nobody" as const;
    const sum = (f: (s: (typeof slips)[number]) => bigint) => slips.reduce((t, s) => t + f(s), 0n);
    const run = (await db.query<{ id: string }>(
      `insert into pay_runs (entity_id, period, gross, tds, other, net, prepared_by) values ($1, $2::date, $3, $4, $5, $6, $7) returning id`,
      [entityId, period, paiseToDecimal(sum((s) => s.gross)), paiseToDecimal(sum((s) => s.tds)), paiseToDecimal(sum((s) => s.other)), paiseToDecimal(sum((s) => s.net)), by],
    ))[0];
    for (const s of slips) {
      await db.query(
        `insert into payslips (pay_run_id, employee_id, days_in_month, payable_days, lop_days, monthly_gross, gross, tds, other, net)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [run.id, s.id, daysInMonth(period), s.payableDays, s.lopDays, s.monthly, paiseToDecimal(s.gross), paiseToDecimal(s.tds), paiseToDecimal(s.other), paiseToDecimal(s.net)],
      );
    }
    return "ok" as const;
  });
}

export async function discardRun(id: string) {
  const sql = await getSql();
  return (await sql.query("delete from pay_runs where id = $1 and status = 'draft' returning id", [id])).length > 0;
}

/** Posts a draft run: salary expense against salaries, TDS and other deductions payable. */
export async function postRun(id: string, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const r = (await db.query<{ id: string; entity_id: string; period: string; gross: string; tds: string; other: string; net: string }>(
      "select id, entity_id, period::text, gross::text, tds::text, other::text, net::text from pay_runs where id = $1 and status = 'draft' for update",
      [id],
    ))[0];
    if (!r) return false;
    const [gross, tds, other, net] = [r.gross, r.tds, r.other, r.net].map(decimalToPaise);
    const journal = await postByCodes(db, {
      entityId: r.entity_id, date: monthEnd(r.period), by, sourceType: "payroll", sourceId: r.id, memo: `Payroll ${r.period.slice(0, 7)}`,
      lines: [
        { code: "5010", debit: gross, credit: 0n }, { code: "2300", debit: 0n, credit: net },
        { code: "2200", debit: 0n, credit: tds }, { code: "2400", debit: 0n, credit: other },
      ],
    });
    await db.query("update pay_runs set status = 'posted', journal_entry_id = $2 where id = $1", [id, journal]);
    return true;
  });
}

/** Pays a posted run: clears salaries payable against the bank. */
export async function payRun(id: string, date: string, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const r = (await db.query<{ entity_id: string; period: string; net: string }>(
      "select entity_id, period::text, net::text from pay_runs where id = $1 and status = 'posted' for update",
      [id],
    ))[0];
    if (!r) return false;
    const net = decimalToPaise(r.net);
    const journal = net > 0n
      ? await postByCodes(db, {
          entityId: r.entity_id, date, by, sourceType: "payroll_payment", sourceId: id, memo: `Salaries paid ${r.period.slice(0, 7)}`,
          lines: [{ code: "2300", debit: net, credit: 0n }, { code: "1010", debit: 0n, credit: net }],
        })
      : null;
    await db.query("update pay_runs set status = 'paid', pay_journal_id = $2 where id = $1", [id, journal]);
    return true;
  });
}

/** Who a leave request belongs to, for telling them the decision. */
export async function leaveOwner(id: string) {
  const sql = await getSql();
  return (await sql.query<{ user_id: string | null; from_date: string; to_date: string }>(
    "select m.user_id, l.from_date::text, l.to_date::text from leave_requests l join employees m on m.id = l.employee_id where l.id = $1",
    [id],
  ))[0] ?? null;
}

/** Signed-in people paid in a run, and its month. */
export async function runPeople(runId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ user_id: string | null; period: string }>(
    `select m.user_id, r.period::text from pay_runs r left join payslips s on s.pay_run_id = r.id
       left join employees m on m.id = s.employee_id where r.id = $1`,
    [runId],
  );
  return { users: rows.map((r) => r.user_id), period: rows[0]?.period.slice(0, 7) ?? "" };
}
