-- Workflows: the links that let one record lead to the next (additive only).
-- A deal leads to its invoices, its holding or venture, its documents and its tasks; a contact
-- (party) gathers everything done with them. Workflow progress itself is never stored: it is
-- worked out on read from these links (src/lib/workflows-calc.ts).

alter table invoices add column if not exists deal_id text references deals (id) on delete set null;
alter table holdings add column if not exists deal_id text references deals (id) on delete set null;
alter table ventures add column if not exists deal_id text references deals (id) on delete set null;

alter table documents add column if not exists deal_id text references deals (id) on delete set null;
alter table documents add column if not exists party_id text references parties (id) on delete set null;
alter table documents add column if not exists invoice_id text references invoices (id) on delete set null;

alter table tasks add column if not exists party_id text references parties (id) on delete set null;
alter table wa_contacts add column if not exists party_id text references parties (id) on delete set null;

-- When a deal first reached Closed: the follow-up (task, KYC) is opened once, never twice.
alter table deals add column if not exists closed_at timestamptz;

create index if not exists invoices_deal_idx on invoices (deal_id) where deal_id is not null;
create index if not exists holdings_deal_idx on holdings (deal_id) where deal_id is not null;
create index if not exists ventures_deal_idx on ventures (deal_id) where deal_id is not null;
create index if not exists documents_deal_idx on documents (deal_id) where deal_id is not null;
create index if not exists documents_party_idx on documents (party_id) where party_id is not null;
create index if not exists tasks_deal_idx on tasks (deal_id) where deal_id is not null;
create index if not exists tasks_party_idx on tasks (party_id) where party_id is not null;
create index if not exists money_deal_idx on money_entries (deal_id) where deal_id is not null;
create index if not exists wa_contacts_party_idx on wa_contacts (party_id) where party_id is not null;
