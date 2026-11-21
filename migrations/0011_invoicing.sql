-- Invoicing with GST, receipts with TDS, and GST details for entities and parties.

insert into ledger_accounts (entity_id, code, name, type)
  select e.id, a.code, a.name, a.type from entities e,
    (values ('2110', 'Output CGST', 'liability'), ('2120', 'Output SGST', 'liability'), ('2130', 'Output IGST', 'liability'))
      as a(code, name, type)
on conflict (entity_id, code) do nothing;

alter table entities add column if not exists gstin text;
alter table entities add column if not exists state_code text;
alter table entities add column if not exists address text not null default '';
alter table entities add column if not exists invoice_prefix text not null default 'INV';
alter table entities add column if not exists next_invoice_no integer not null default 1;
-- Numbering restarts every financial year.
alter table entities add column if not exists invoice_fy text;

alter table parties add column if not exists gstin text;
alter table parties add column if not exists state_code text;
alter table parties add column if not exists address text not null default '';
-- When a party is one of our own entities (a venture's SPV billed the Business House fee).
alter table parties add column if not exists entity_id text unique references entities (id);

create table if not exists invoices (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  party_id text not null references parties (id),
  number text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  issue_date date not null,
  due_date date not null,
  place_of_supply text not null,
  income_code text not null default '4010',
  subtotal numeric(16, 2) not null default 0,
  cgst numeric(16, 2) not null default 0,
  sgst numeric(16, 2) not null default 0,
  igst numeric(16, 2) not null default 0,
  total numeric(16, 2) not null default 0,
  received numeric(16, 2) not null default 0,
  tds numeric(16, 2) not null default 0,
  notes text not null default '',
  source_type text not null default 'manual',
  source_id text,
  journal_entry_id text references journal_entries (id),
  cancel_journal_id text references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entity_id, number),
  check (due_date >= issue_date)
);
create index if not exists invoices_entity_idx on invoices (entity_id, issue_date desc);

create table if not exists invoice_lines (
  id bigserial primary key,
  invoice_id text not null references invoices (id) on delete cascade,
  description text not null,
  sac text not null default '',
  qty_milli bigint not null check (qty_milli > 0),
  rate numeric(16, 2) not null check (rate >= 0),
  gst_bps integer not null check (gst_bps in (0, 500, 1200, 1800, 2800)),
  amount numeric(16, 2) not null,
  tax numeric(16, 2) not null
);

create table if not exists invoice_receipts (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references invoices (id),
  receipt_date date not null,
  amount numeric(16, 2) not null check (amount >= 0),
  tds numeric(16, 2) not null default 0 check (tds >= 0),
  journal_entry_id text not null references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount + tds > 0)
);
