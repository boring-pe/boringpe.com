import { getSql } from "./db";
import { decimalToPaise } from "./books";
import { createCase } from "./kyc";
import { workspaceForNew } from "./workspaces";
import { dealSteps, pathOf, spendSteps, isStuck, type DealFacts, type KycState } from "./workflows-calc";

// ---- the facts a deal's workflow is read from

type FactRow = {
  id: string; pillar: string; stage: string; pending_stage: string | null; party_id: string | null;
  kyc_status: string | null; kyc_id: string | null; issued: number; drafts: number; outstanding: string | null;
  receipts: number; receipts_matched: number; holding_id: string | null; invested: boolean; invest_matched: boolean;
  venture_id: string | null; periods: number;
};

/** One query for any number of deals: every link a workflow step needs, read where it lives. */
const FACTS = `
  select d.id, d.pillar, d.stage, d.pending_stage, d.party_id,
    k.status as kyc_status, k.id as kyc_id,
    (select count(*)::int from invoices i where i.deal_id = d.id and i.status in ('issued', 'paid')) as issued,
    (select count(*)::int from invoices i where i.deal_id = d.id and i.status = 'draft') as drafts,
    (select coalesce(sum(i.total - i.received - i.tds), 0)::text from invoices i where i.deal_id = d.id and i.status = 'issued') as outstanding,
    (select count(*)::int from invoice_receipts r join invoices i on i.id = r.invoice_id where i.deal_id = d.id) as receipts,
    (select count(*)::int from invoice_receipts r join invoices i on i.id = r.invoice_id
      where i.deal_id = d.id and exists (select 1 from bank_lines b where b.journal_entry_id = r.journal_entry_id)) as receipts_matched,
    h.id as holding_id,
    coalesce((select bool_or(t.kind = 'invest') from holding_txns t where t.holding_id = h.id), false) as invested,
    coalesce((select bool_and(exists (select 1 from bank_lines b where b.journal_entry_id = t.journal_entry_id))
      from holding_txns t where t.holding_id = h.id and t.kind = 'invest'), false) as invest_matched,
    v.id as venture_id,
    (select count(*)::int from venture_periods p where p.venture_id = v.id) as periods
  from deals d
  left join lateral (select id, status from kyc_cases where party_id = d.party_id and d.party_id is not null and parent_case_id is null
                     order by created_at desc limit 1) k on true
  left join lateral (select id from holdings where deal_id = d.id order by created_at limit 1) h on true
  left join lateral (select id from ventures where deal_id = d.id order by created_at limit 1) v on true`;

const kycOf = (s: string | null): KycState => (!s ? "none" : s === "verified" ? "verified" : s === "rejected" || s === "expired" ? "rejected" : "open");

function toFacts(r: FactRow): DealFacts {
  return {
    id: r.id, pillar: r.pillar, stage: r.stage, pendingStage: r.pending_stage, partyId: r.party_id,
    kyc: kycOf(r.kyc_status), kycCaseId: r.kyc_id, invoicesIssued: r.issued, invoiceDrafts: r.drafts,
    outstanding: decimalToPaise(r.outstanding ?? "0"), receipts: r.receipts, receiptsMatched: r.receipts_matched,
    holdingId: r.holding_id, invested: r.invested, investMatched: r.invest_matched, ventureId: r.venture_id, venturePeriods: r.periods,
  };
}

export async function dealFacts(id: string): Promise<DealFacts | null> {
  const sql = await getSql();
  const r = (await sql.query<FactRow>(`${FACTS} where d.id = $1`, [id]))[0];
  return r ? toFacts(r) : null;
}

/** Each listed deal's steps, for the progress bars on the pipeline. */
export async function dealStepsFor(ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof dealSteps>>();
  const sql = await getSql();
  const rows = await sql.query<FactRow>(`${FACTS} where d.id = any($1::text[])`, [ids]);
  return new Map(rows.map((r) => [r.id, dealSteps(toFacts(r))]));
}

// ---- everything linked to one deal

export async function dealLinks(id: string) {
  const sql = await getSql();
  const [invoices, money, tasks, documents, approvals] = await Promise.all([
    sql.query<{ id: string; number: string | null; status: string; total: string; outstanding: string; due_date: string; issue_date: string }>(
      `select id, number, status, total::text, greatest(total - received - tds, 0)::text as outstanding, due_date::text, issue_date::text
         from invoices where deal_id = $1 order by issue_date desc, created_at desc`, [id]),
    sql.query<{ id: string; direction: string; amount: string; memo: string; status: string; entry_date: string; journal_entry_id: string | null }>(
      `select id, direction, amount::text, memo, status, entry_date::text, journal_entry_id from money_entries where deal_id = $1 order by entry_date desc`, [id]),
    sql.query<{ id: string; title: string; done: boolean; due_date: string | null; assignee_email: string | null }>(
      `select t.id, t.title, t.done, t.due_date::text, u.email as assignee_email from tasks t left join users u on u.id = t.assignee_id
        where t.deal_id = $1 order by t.done, t.due_date nulls last, t.created_at desc`, [id]),
    sql.query<{ id: string; title: string; file_name: string; size: number; created_at: string }>(
      `select id, title, file_name, size, to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as created_at
         from documents where deal_id = $1 order by created_at desc`, [id]),
    sql.query<{ id: string; title: string; status: string }>(
      `select id, title, status from approvals where ref_type = 'deal_stage' and ref_id = $1 order by created_at desc limit 5`, [id]),
  ]);
  return { invoices, money, tasks, documents, approvals };
}

// ---- a contact: everything done with one party

export async function partyRecord(id: string) {
  const sql = await getSql();
  const party = (await sql.query<{ id: string; name: string; kind: string; email: string | null; gstin: string | null; notes: string; created_at: string }>(
    "select id, name, kind, email, gstin, notes, to_char(created_at, 'YYYY-MM-DD') as created_at from parties where id = $1", [id]))[0];
  if (!party) return null;
  const [deals, invoices, money, kyc, tasks, documents, wa] = await Promise.all([
    sql.query<{ id: string; name: string; pillar: string; stage: string; value: string | null }>(
      "select id, name, pillar, stage, value::text from deals where party_id = $1 order by updated_at desc", [id]),
    sql.query<{ id: string; number: string | null; status: string; total: string; outstanding: string; due_date: string }>(
      `select id, number, status, total::text, greatest(total - received - tds, 0)::text as outstanding, due_date::text
         from invoices where party_id = $1 order by issue_date desc, created_at desc limit 50`, [id]),
    sql.query<{ id: string; direction: string; amount: string; memo: string; status: string; entry_date: string }>(
      "select id, direction, amount::text, memo, status, entry_date::text from money_entries where party_id = $1 order by entry_date desc limit 50", [id]),
    sql.query<{ id: string; status: string; subject_name: string }>(
      "select id, status, subject_name from kyc_cases where party_id = $1 and parent_case_id is null order by created_at desc", [id]),
    sql.query<{ id: string; title: string; done: boolean; due_date: string | null; deal_name: string | null }>(
      `select t.id, t.title, t.done, t.due_date::text, d.name as deal_name from tasks t left join deals d on d.id = t.deal_id
        where t.party_id = $1 or d.party_id = $1 order by t.done, t.due_date nulls last, t.created_at desc limit 50`, [id]),
    sql.query<{ id: string; title: string; file_name: string; created_at: string; deal_name: string | null }>(
      `select doc.id, doc.title, doc.file_name, to_char(doc.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as created_at, d.name as deal_name
         from documents doc left join deals d on d.id = doc.deal_id
        where doc.party_id = $1 or d.party_id = $1 or doc.invoice_id in (select id from invoices where party_id = $1)
        order by doc.created_at desc limit 50`, [id]),
    sql.query<{ wa_id: string; name: string | null; last_message_at: string; unread: number; last_text: string | null }>(
      `select c.wa_id, c.name, to_char(c.last_message_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as last_message_at, c.unread,
              (select m.body from wa_messages m where m.wa_id = c.wa_id order by m.created_at desc limit 1) as last_text
         from wa_contacts c where c.party_id = $1 order by c.last_message_at desc`, [id]),
  ]);
  return { party, deals, invoices, money, kyc, tasks, documents, wa };
}

export async function listParties() {
  const sql = await getSql();
  return sql.query<{ id: string; name: string; kind: string; email: string | null; deals: number; open_deals: number; owed: string; kyc_status: string | null }>(
    `select p.id, p.name, p.kind, p.email,
       (select count(*)::int from deals d where d.party_id = p.id) as deals,
       (select count(*)::int from deals d where d.party_id = p.id and d.stage not in ('closed', 'passed')) as open_deals,
       (select coalesce(sum(i.total - i.received - i.tds), 0)::text from invoices i where i.party_id = p.id and i.status = 'issued') as owed,
       (select k.status from kyc_cases k where k.party_id = p.id and k.parent_case_id is null order by k.created_at desc limit 1) as kyc_status
     from parties p order by p.name limit 500`,
  );
}

/** WhatsApp chats not yet tied to a contact, for linking one from the contact's page. */
export async function unlinkedChats() {
  const sql = await getSql();
  return sql.query<{ wa_id: string; name: string | null }>("select wa_id, name from wa_contacts where party_id is null order by last_message_at desc limit 50");
}

// ---- automation: what closing a deal sets in motion

/**
 * Runs once per deal, the first time it reaches Closed (by the Super Admin directly or by an
 * approved request): opens the next step as a task for whoever added the deal, and a KYC case for
 * its contact if they have none. Safe to call again: `closed_at` makes it a no-op.
 */
export async function onDealClosed(dealId: string, actor: { id: string | null; email: string | null }) {
  const sql = await getSql();
  const deal = (await sql.query<{ name: string; pillar: string; party_id: string | null; created_by: string | null; vertical: string | null }>(
    "update deals set closed_at = now() where id = $1 and stage = 'closed' and closed_at is null returning name, pillar, party_id, created_by, null::text as vertical",
    [dealId],
  ))[0];
  if (!deal) return;
  const next = { cash: "raise the first invoice", holding: "record the holding and the investment", venture: "set up the venture" }[pathOf(deal.pillar)];
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await sql.query(
    "insert into tasks (title, deal_id, party_id, assignee_id, due_date, created_by, workspace) values ($1, $2, $3, $4, $5, $6, $7)",
    [`${deal.name}: ${next}`, dealId, deal.party_id, deal.created_by ?? actor.id, due, actor.id, await workspaceForNew()],
  );
  if (deal.party_id) {
    const party = (await sql.query<{ name: string; kind: string; email: string | null; has_case: boolean }>(
      "select name, kind, email, exists (select 1 from kyc_cases where party_id = p.id) as has_case from parties p where id = $1",
      [deal.party_id],
    ))[0];
    const by = actor.id ?? deal.created_by;
    if (party && !party.has_case && by) {
      await createCase({
        subjectType: party.kind === "person" ? "person" : "entity", name: party.name, email: party.email, link: { party: deal.party_id },
        company: party.kind === "company" || party.kind === "fund", gstRegistered: false, by, byEmail: actor.email ?? "workflow",
      });
    }
  }
}

// ---- spend to bank

export type SpendRow = { id: string; direction: "in" | "out"; status: string; journal_entry_id: string | null; entry_date: string };

/** Which of these entries' postings are on a bank statement. */
export async function matchedJournals(journalIds: string[]) {
  if (!journalIds.length) return new Set<string>();
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>("select distinct journal_entry_id as id from bank_lines where journal_entry_id = any($1::text[])", [journalIds]);
  return new Set(rows.map((r) => r.id));
}

export function spendFor(row: SpendRow, matched: Set<string>, today: string) {
  const ageDays = Math.floor((Date.parse(today) - Date.parse(row.entry_date)) / 86_400_000);
  const facts = { direction: row.direction, status: row.status, posted: Boolean(row.journal_entry_id), matched: Boolean(row.journal_entry_id && matched.has(row.journal_entry_id)), ageDays };
  return { steps: spendSteps(facts), stuck: isStuck(facts) };
}

/** Posted money a week old or more that the bank statement does not show yet, for the dashboard. */
export async function stuckMoney(entityIds: string[]) {
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    `select count(*)::int as n from money_entries m
      where m.entity_id = any($1::text[]) and m.journal_entry_id is not null and m.status in ('approved', 'recorded')
        and m.entry_date <= current_date - 7
        and not exists (select 1 from bank_lines b where b.journal_entry_id = m.journal_entry_id)`,
    [entityIds],
  );
  return rows[0]?.n ?? 0;
}

// ---- links made where the next step is taken

/** Ties an invoice to the deal it was raised from (only a deal that exists). */
export async function linkInvoiceDeal(invoiceId: string, dealId: string) {
  const sql = await getSql();
  await sql.query("update invoices set deal_id = d.id from deals d where invoices.id = $1 and d.id = $2", [invoiceId, dealId]);
}
/** Ties a holding or venture to the deal it came from. */
export async function linkToDeal(table: "holdings" | "ventures", id: string, dealId: string) {
  const sql = await getSql();
  await sql.query(`update ${table} set deal_id = d.id from deals d where ${table}.id = $1 and d.id = $2`, [id, dealId]);
}
