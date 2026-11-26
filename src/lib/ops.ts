import { getSql, type Sql } from "./db";
import { decimalToPaise, ensureCharts, postByCodes } from "./books";
import { counts, moneyLines } from "./money-books";
import { entityIdsInView, workspaceContext, workspaceForNew } from "./workspaces";
import type { ApprovalRow } from "./approvals";
import { onDealClosed } from "./workflows";
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
  vertical: string | null;
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
  entity_id: string | null;
  entity_name: string | null;
  journal_entry_id: string | null;
  currency: string;
  fx_amount: string | null;
};
export type TaskRow = {
  id: string;
  vertical: string | null;
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
export async function setStage(id: string, stage: Stage, actor: { id: string | null; email: string | null } = { id: null, email: null }) {
  const sql = await getSql();
  const rows = await sql.query(
    "update deals set stage = $2, pending_stage = null, updated_at = now() where id = $1 returning id",
    [id, stage],
  );
  // Closing a deal opens its next step (a task, and KYC for the contact). Once per deal.
  if (rows.length && stage === "closed") await onDealClosed(id, actor);
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
const MONEY_SELECT = `select m.id, m.vertical, m.direction, m.category, m.amount::text as amount, m.memo, m.deal_id,
  d.name as deal_name, p.name as party_name, m.status, m.entry_date::text as entry_date,
  u.email as created_by_email, m.entity_id, en.name as entity_name, m.journal_entry_id, m.currency, m.fx_amount::text as fx_amount
  from money_entries m
  left join deals d on d.id = m.deal_id left join parties p on p.id = m.party_id
  left join users u on u.id = m.created_by left join entities en on en.id = m.entity_id`;

export async function listMoney(limit = 100) {
  const sql = await getSql();
  return sql.query<MoneyRow>(`${MONEY_SELECT} where m.entity_id = any($2::text[]) order by m.created_at desc limit $1`, [limit, await entityIdsInView()]);
}
/**
 * Posts one counted Money entry to its entity's books, once. Runs inside the caller's transaction,
 * so the entry and its journal commit together.
 */
async function postMoney(db: Sql, id: string, by: string | null): Promise<boolean> {
  const row = (await db.query<{ id: string; direction: "in" | "out"; category: string; amount: string; memo: string; status: string; entity_id: string | null; entry_date: string; created_by: string | null }>(
    `select id, direction, category, amount::text, memo, status, entity_id, entry_date::text, created_by
       from money_entries where id = $1 and journal_entry_id is null for update`,
    [id],
  ))[0];
  if (!row || !row.entity_id || !counts(row.status)) return false;
  const journal = await postByCodes(db, {
    entityId: row.entity_id, date: row.entry_date, by: by ?? row.created_by ?? "", sourceType: "money", sourceId: row.id,
    memo: `${row.direction === "in" ? "Money in" : "Payment"}: ${row.memo || row.category}`,
    lines: moneyLines(row.direction, row.category, decimalToPaise(row.amount)),
  });
  await db.query("update money_entries set journal_entry_id = $2 where id = $1", [row.id, journal]);
  return true;
}

export async function createEntry(e: {
  direction: "in" | "out"; category: Category; amount: string; memo: string; dealId: string | null;
  partyId: string | null; status: "recorded" | "awaiting_approval" | "approved"; date: string; by: string; entityId: string;
  currency?: string; fxAmount?: string | null; fxRate?: string | null;
}) {
  await ensureCharts();
  const sql = await getSql();
  return sql.tx(async (db) => {
    const rows = await db.query<{ id: string }>(
      `insert into money_entries (direction, category, amount, memo, deal_id, party_id, status, entry_date, created_by, entity_id,
                                  currency, fx_amount, fx_rate)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::numeric,$13::numeric) returning id`,
      [e.direction, e.category, e.amount, e.memo, e.dealId, e.partyId, e.status, e.date, e.by, e.entityId,
        e.currency ?? "INR", e.fxAmount ?? null, e.fxRate ?? null],
    );
    if (counts(e.status)) await postMoney(db, rows[0].id, e.by);
    return rows[0].id;
  });
}

/** Entries that count but were recorded before Money was connected to the books. */
export async function unpostedMoneyCount() {
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    "select count(*)::int as n from money_entries where journal_entry_id is null and status in ('recorded', 'approved')",
  );
  return rows[0].n;
}

/** Posts every counted entry that has no journal yet. Each one in its own transaction. */
export async function postUnpostedMoney(by: string) {
  await ensureCharts();
  const sql = await getSql();
  const ids = await sql.query<{ id: string }>(
    "select id from money_entries where journal_entry_id is null and status in ('recorded', 'approved') order by entry_date, created_at",
  );
  let posted = 0;
  for (const { id } of ids) {
    if (await sql.tx((db) => postMoney(db, id, by))) posted += 1;
  }
  return posted;
}

// ---- tasks
/** All tasks, or only those assigned to or created by `onlyFor` (external people). */
export async function listTasks(onlyFor: string | null = null) {
  const sql = await getSql();
  return sql.query<TaskRow>(
    `select t.id, t.vertical, t.title, t.deal_id, d.name as deal_name, t.assignee_id, u.email as assignee_email,
       t.due_date::text as due_date, t.done from tasks t
       left join deals d on d.id = t.deal_id left join users u on u.id = t.assignee_id
      where ($1::text is null or t.assignee_id = $1 or t.created_by = $1) and t.workspace = any($2::text[])
      order by t.done, t.due_date nulls last, t.created_at desc limit 200`,
    [onlyFor, (await workspaceContext()).inView],
  );
}
export async function createTask(t: { title: string; dealId: string | null; assigneeId: string | null; due: string | null; by: string; vertical?: string | null }) {
  const sql = await getSql();
  await sql.query(
    "insert into tasks (title, deal_id, assignee_id, due_date, created_by, workspace, vertical) values ($1,$2,$3,$4,$5,$6,$7)",
    [t.title, t.dealId, t.assigneeId, t.due, t.by, await workspaceForNew(), t.vertical ?? null],
  );
}
export async function setTaskDone(id: string, done: boolean, onlyFor: string | null = null) {
  const sql = await getSql();
  return (
    await sql.query(
      `update tasks set done = $2 where id = $1 and workspace = any($4::text[])
          and ($3::text is null or assignee_id = $3 or created_by = $3) returning id`,
      [id, done, onlyFor, (await workspaceContext()).inView],
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
  const { inView } = await workspaceContext();
  const ids = await entityIdsInView();
  const [deals, money, tasks] = await Promise.all([
    sql.query<{ stage: string; n: number; value: string | null }>(
      "select stage, count(*)::int as n, sum(value)::text as value from deals where $1 group by stage",
      [inView.includes("boring_pe")],
    ),
    sql.query<{ moneyin: string | null; moneyout: string | null; waiting: number }>(
      `select sum(amount) filter (where direction = 'in' and status = 'recorded')::text as moneyin,
         sum(amount) filter (where direction = 'out' and status = 'approved')::text as moneyout,
         count(*) filter (where status = 'awaiting_approval')::int as waiting from money_entries where entity_id = any($1::text[])`,
      [ids],
    ),
    sql.query<{ open: number; overdue: number }>(
      `select count(*) filter (where not done)::int as open,
         count(*) filter (where not done and due_date < current_date)::int as overdue from tasks where workspace = any($1::text[])`,
      [inView],
    ),
  ]);
  return { deals, money: money[0], tasks: tasks[0] };
}

// ---- what an approval decision does to the thing it gates
export async function applyDecision(row: ApprovalRow, outcome: "approved" | "rejected" | "withdrawn", actorId: string | null = null) {
  if (!row.ref_id) return;
  const sql = await getSql();
  if (row.ref_type === "money_entry") {
    const status = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "withdrawn";
    if (status === "approved") await ensureCharts();
    // The payment and its posting to the books happen together or not at all.
    await sql.tx(async (db) => {
      const changed = await db.query(
        "update money_entries set status = $2 where id = $1 and status = 'awaiting_approval' returning id",
        [row.ref_id, status],
      );
      if (changed.length && status === "approved") await postMoney(db, row.ref_id!, actorId);
    });
  } else if (row.ref_type === "deal_stage") {
    if (outcome === "approved") {
      const moved = await sql.query<{ stage: string }>(
        "update deals set stage = pending_stage, pending_stage = null, updated_at = now() where id = $1 and pending_stage is not null returning stage",
        [row.ref_id],
      );
      if (moved[0]?.stage === "closed") {
        const email = actorId ? (await sql.query<{ email: string }>("select email from users where id = $1", [actorId]))[0]?.email ?? null : null;
        await onDealClosed(row.ref_id, { id: actorId, email });
      }
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
