-- Meetings linked to records, Razorpay payment links on invoices, and the payment gateway account.

insert into ledger_accounts (entity_id, code, name, type)
  select id, '1030', 'Payment gateway (Razorpay)', 'asset' from entities
on conflict (entity_id, code) do nothing;

create table if not exists meeting_links (
  id text primary key default gen_random_uuid()::text,
  mail_account_id text not null references mail_accounts (id) on delete cascade,
  event_id text not null,
  title text not null,
  starts_at timestamptz not null,
  join_url text,
  link_type text check (link_type in ('deal', 'venture', 'party', 'employee')),
  link_id text,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mail_account_id, event_id)
);
create index if not exists meeting_links_ref_idx on meeting_links (link_type, link_id);

create table if not exists payment_links (
  id text primary key,
  invoice_id text not null references invoices (id),
  amount numeric(16, 2) not null,
  short_url text not null,
  status text not null default 'created',
  razorpay_payment_id text unique,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payment_links_invoice_idx on payment_links (invoice_id);

-- Each Razorpay event is handled once.
create table if not exists razorpay_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
