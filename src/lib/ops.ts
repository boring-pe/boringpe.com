import { getSql } from "./db";
import type { ApprovalRow } from "./approvals";
import type { Category, PartyKind, Pillar, Stage } from "./ops-fields";

export type PartyRow = { id: string; name: string; kind: PartyKind; email: string | null; notes: string; created_at: Date };
export type DealRow = {
  id: string;
  name: string;
  pillar: Pillar;
  stage: Stage;
  pending_stage: "closing" | "closed" | null;
  party_id: string | null;
  party_name: string | null;
  value: string | null;
  notes: string;
  updated_at: Date;
};
export type MoneyRow = {
  id: string;
  direction: "in" | "out";
  category: Category;
  amount: string;
  memo: string;
  deal_id: string | null;
  deal_name: string | null;
  party_name: string | null;
  status: "recorded" | "awaiting_approval" | "approved" | "rejected" | "withdrawn";
  entry_date: string;
  created_by_email: string | null;
};
export type TaskRow = {
  id: string;
  title: string;
  deal_id: string | null;
  deal_name: string | null;
  assignee_id: string | null;
  assignee_email: string | null;
  due_date: string | null;
  done: boolean;
};

// ---- parties
export async function listParties() {
  const sql = await getSql();
  return sql.query<PartyRow>("select id, name, kind, email, notes, created_at from parties order by name");
}
export async function createParty(p: { name: string; kind: PartyKind; email: string | null; notes: string; by: string }) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    "insert into parties (name, kind, email, notes, created_by) values ($1,$2,$3,$4,$5) returning id",
    [p.name, p.kind, p.email, p.notes, p.by],
  );
  return rows[0].id;
}
export async function partyExists(id: string) {
  const sql = await getSql();
  return (await sql.query("select 1 from parties where id = $1", [id])).length > 0;
}

// ---- deals
const DEAL_SELECT = `select d.id, d.name, d.pillar, d.stage, d.pending_stage, d.party_id, p.name as party_name,
  d.value::text as value, d.notes, d.updated_at from deals d left join parties p on p.id = d.party_id`;

export async function listDeals() {
  const sql = await getSql();
  return sql.query<DealRow>(`${DEAL_SELECT} order by d.updated_at desc limit 200`);
}
export async function getDeal(id: string) {
  const sql = await getSql();
  const rows = await sql.query<DealRow>(`${DEAL_SELECT} where d.id = $1`, [id]);
  return rows[0] ?? null;
}
export async function createDeal(d: {
  name: string; pillar: Pillar; partyId: string | null; value: string | null; notes: string; by: string;
}) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    "insert into deals (name, pillar, party_id, value, notes, created_by) values ($1,$2,$3,$4,$5,$6) returning id",
    [d.name, d.pillar, d.partyId, d.value, d.notes, d.by],
  );
  return rows[0].id;
}
export async function setStage(id: string, stage: Stage) {
  const sql = await getSql();
  const rows = await sql.query(
    "update deals set stage = $2, pending_stage = null, updated_at = now() where id = $1 returning id",
    [id, stage],
  );
  return rows.length > 0;
}
/** Parks a gated move. Fails (false) if the deal already has one waiting. */
export async function parkStage(id: string, stage: "closing" | "closed") {
  const sql = await getSql();
  const rows = await sql.query(
    "update deals set pending_stage = $2 where id = $1 and pending_stage is null returning id",
    [id, stage],
  );
  return rows.length > 0;
}

// ---- money
const MONEY_SELECT = `select m.id, m.direction, m.category, m.amount::text as amount, m.memo, m.deal_id,
  d.name as deal_name, p.name as party_name, m.status, m.entry_date::text as entry_date,
  u.email as created_by_email from money_entries m
  left join deals d on d.id = m.deal_id left join parties p on p.id = m.party_id
  left join users u on u.id = m.created_by`;

export async function listMoney(limit = 100) {
  const sql = await getSql();
  return sql.query<MoneyRow>(`${MONEY_SELECT} order by m.created_at desc limit $1`, [limit]);
}
export async function createEntry(e: {
  direction: "in" | "out"; category: Category; amount: string; memo: string; dealId: string | null;
  partyId: string | null; status: "recorded" | "awaiting_approval" | "approved"; date: string; by: string;
}) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `insert into money_entries (direction, category, amount, memo, deal_id, party_id, status, entry_date, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [e.direction, e.category, e.amount, e.memo, e.dealId, e.partyId, e.status, e.date, e.by],
  );
  return rows[0].id;
}

// ---- tasks
/** All tasks, or only those assigned to or created by `onlyFor` (external people). */
export async function listTasks(onlyFor: string | null = null) {
  const sql = await getSql();
  return sql.query<TaskRow>(
    `select t.id, t.title, t.deal_id, d.name as deal_name, t.assignee_id, u.email as assignee_email,
       t.due_date::text as due_date, t.done from tasks t
       left join deals d on d.id = t.deal_id left join users u on u.id = t.assignee_id
      where $1::text is null or t.assignee_id = $1 or t.created_by = $1
      order by t.done, t.due_date nulls last, t.created_at desc limit 200`,
    [onlyFor],
  );
}
export async function createTask(t: { title: string; dealId: string | null; assigneeId: string | null; due: string | null; by: string }) {
  const sql = await getSql();
  await sql.query(
    "insert into tasks (title, deal_id, assignee_id, due_date, created_by) values ($1,$2,$3,$4,$5)",
    [t.title, t.dealId, t.assigneeId, t.due, t.by],
  );
}
export async function setTaskDone(id: string, done: boolean, onlyFor: string | null = null) {
  const sql = await getSql();
  return (
    await sql.query(
      `update tasks set done = $2 where id = $1
          and ($3::text is null or assignee_id = $3 or created_by = $3) returning id`,
      [id, done, onlyFor],
    )
  ).length > 0;
}
export async function listAssignees() {
  const sql = await getSql();
  return sql.query<{ id: string; label: string }>(
    "select id, coalesce(name, email) as label from users where status = 'active' order by label",
  );
}

// ---- summary for the dashboard
export async function summary() {
  const sql = await getSql();
  const [deals, money, tasks] = await Promise.all([
    sql.query<{ stage: string; n: number; value: string | null }>(
      "select stage, count(*)::int as n, sum(value)::text as value from deals group by stage",
    ),
    sql.query<{ moneyin: string | null; moneyout: string | null; waiting: number }>(
      `select sum(amount) filter (where direction = 'in' and status = 'recorded')::text as moneyin,
         sum(amount) filter (where direction = 'out' and status = 'approved')::text as moneyout,
         count(*) filter (where status = 'awaiting_approval')::int as waiting from money_entries`,
    ),
    sql.query<{ open: number; overdue: number }>(
      `select count(*) filter (where not done)::int as open,
         count(*) filter (where not done and due_date < current_date)::int as overdue from tasks`,
    ),
  ]);
  return { deals, money: money[0], tasks: tasks[0] };
}

// ---- what an approval decision does to the thing it gates
export async function applyDecision(row: ApprovalRow, outcome: "approved" | "rejected" | "withdrawn") {
  if (!row.ref_id) return;
  const sql = await getSql();
  if (row.ref_type === "money_entry") {
    const status = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "withdrawn";
    await sql.query("update money_entries set status = $2 where id = $1 and status = 'awaiting_approval'", [row.ref_id, status]);
  } else if (row.ref_type === "deal_stage") {
    if (outcome === "approved") {
      await sql.query(
        "update deals set stage = pending_stage, pending_stage = null, updated_at = now() where id = $1 and pending_stage is not null",
        [row.ref_id],
      );
    } else {
      await sql.query("update deals set pending_stage = null where id = $1", [row.ref_id]);
    }
  }
}

export async function unparkStage(id: string) {
  const sql = await getSql();
  await sql.query("update deals set pending_stage = null where id = $1", [id]);
}
export async function dropEntry(id: string) {
  const sql = await getSql();
  await sql.query("delete from money_entries where id = $1 and status = 'awaiting_approval'", [id]);
}
