-- Ventures run by operators on revenue or profit sharing, their monthly statements, and the
-- Business House fee that Boring PE (Enable) charges Build and Co-Build ventures.

-- New account for the fee, on every existing chart. New entities get it from the default chart.
insert into ledger_accounts (entity_id, code, name, type)
  select id, '5100', 'Business House fee', 'expense' from entities
on conflict (entity_id, code) do nothing;

create table if not exists ventures (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  pillar text not null check (pillar in ('build', 'co_build')),
  -- The books the venture's revenue and costs post to: Boring PE itself, or its own SPV.
  entity_id text not null references entities (id),
  fee_type text not null default 'none' check (fee_type in ('none', 'fixed', 'percent')),
  fee_fixed numeric(16, 2) not null default 0 check (fee_fixed >= 0),
  fee_bps integer not null default 0 check (fee_bps between 0 and 10000),
  status text not null default 'active' check (status in ('active', 'closed')),
  notes text not null default '',
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists venture_operators (
  id text primary key default gen_random_uuid()::text,
  venture_id text not null references ventures (id),
  name text not null,
  -- When set, this signed-in operator sees the venture's statements and their own share.
  user_id text references users (id) on delete set null,
  basis text not null check (basis in ('revenue', 'profit')),
  share_bps integer not null check (share_bps between 1 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists venture_operators_user_idx on venture_operators (user_id);

create table if not exists venture_periods (
  id text primary key default gen_random_uuid()::text,
  venture_id text not null references ventures (id),
  period date not null check (extract(day from period) = 1),
  revenue numeric(16, 2) not null check (revenue >= 0),
  costs numeric(16, 2) not null check (costs >= 0),
  fee numeric(16, 2) not null check (fee >= 0),
  operator_total numeric(16, 2) not null check (operator_total >= 0),
  net numeric(16, 2) not null,
  journal_entry_id text references journal_entries (id),
  fee_journal_id text references journal_entries (id),
  closed_by text references users (id) on delete set null,
  closed_at timestamptz not null default now(),
  unique (venture_id, period)
);

create table if not exists venture_payouts (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references venture_periods (id),
  operator_id text not null references venture_operators (id),
  amount numeric(16, 2) not null check (amount >= 0),
  paid_on date,
  pay_journal_id text references journal_entries (id),
  unique (period_id, operator_id)
);
