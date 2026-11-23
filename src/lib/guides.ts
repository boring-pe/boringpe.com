import { getSql } from "./db";
import type { Facts } from "./guides-calc";
import { requiredRoles, twoFactorOn } from "./mfa";
import { entityIdsInView } from "./workspaces";

/** The counts the guides check, for the workspaces on view. Only counts: no figures or names. */
export async function guideFacts(userId: string): Promise<Facts> {
  const sql = await getSql();
  const ids = await entityIdsInView();
  const row = (await sql.query<Record<string, number>>(
    `select
       (select count(*) from parties)::int as parties,
       (select count(*) from invoices where entity_id = any($1::text[]))::int as invoices,
       (select count(*) from invoices where entity_id = any($1::text[]) and status <> 'draft')::int as issued,
       (select count(*) from invoices where entity_id = any($1::text[]) and received > 0)::int as received,
       (select count(*) from payment_links)::int as "paymentLinks",
       (select count(*) from bank_imports where entity_id = any($1::text[]))::int as "bankImports",
       (select count(*) from bank_lines l join bank_imports b on b.id = l.import_id where b.entity_id = any($1::text[]) and l.status = 'matched')::int as matched,
       (select count(*) from bank_lines l join bank_imports b on b.id = l.import_id where b.entity_id = any($1::text[]) and l.status = 'unmatched')::int as unmatched,
       (select count(*) from pay_runs where entity_id = any($1::text[]) and status <> 'draft')::int as "payRuns",
       (select count(*) from venture_periods p join ventures v on v.id = p.venture_id where v.entity_id = any($1::text[]))::int as "venturePeriods",
       (select count(*) from depreciation_runs)::int as depreciation,
       (select count(*) from employees where entity_id = any($1::text[]))::int as employees,
       (select count(*) from documents)::int as documents,
       (select count(*) from deals)::int as deals,
       (select count(*) from kyc_cases)::int as "kycCases",
       (select count(*) from kyc_cases where status = 'verified')::int as "kycVerified",
       (select count(*) from holdings where holder_entity_id = any($1::text[]))::int as holdings,
       (select count(*) from holding_txns where kind = 'valuation')::int as valuations,
       (select count(*) from ventures where entity_id = any($1::text[]))::int as ventures,
       (select count(*) from venture_operators)::int as operators,
       (select count(*) from budgets)::int as budgets,
       (select count(*) from mail_accounts where user_id = $2)::int as mailboxes,
       (select count(*) from integrations where provider like 'ai\\_%' and status <> 'disconnected')::int as "aiServices",
       (select count(*) from integrations where provider = 'resend' and status <> 'disconnected')::int as resend,
       (select count(*) from users where status = 'active')::int as seats,
       (select count(*) from access_audit where action = 'backup_downloaded')::int as backups`,
    [ids, userId],
  ))[0];
  const [myTwoStep, roles] = await Promise.all([twoFactorOn(userId), requiredRoles()]);
  return { ...row, myTwoStep, adminsTwoStep: roles.includes("admin"), integrationsKey: Boolean(process.env.INTEGRATIONS_KEY) };
}
