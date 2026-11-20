-- Operations: parties, deals, money and tasks. Amounts are rupees, kept exact in numeric.

create table if not exists parties (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  kind text not null check (kind in ('company', 'person', 'fund', 'vendor')),
  email text,
  notes text not null default '',
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- A deal belongs to one of the four framework pillars.
create table if not exists deals (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  pillar text not null check (pillar in ('build', 'own', 'co_build', 'enable')),
  stage text not null default 'sourcing'
    check (stage in ('sourcing', 'diligence', 'term_sheet', 'closing', 'closed', 'passed')),
  -- A non-owner asking for closing or closed parks the move here until it is approved.
  pending_stage text check (pending_stage in ('closing', 'closed')),
  party_id text references parties (id) on delete set null,
  value numeric(16, 2) check (value is null or value >= 0),
  notes text not null default '',
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_stage_idx on deals (stage, updated_at desc);

-- Money in is a record. Money out stays 'awaiting_approval' until the Super Admin approves.
create table if not exists money_entries (
  id text primary key default gen_random_uuid()::text,
  direction text not null check (direction in ('in', 'out')),
  category text not null
    check (category in ('investment', 'fee', 'expense', 'payout', 'salary', 'other')),
  amount numeric(16, 2) not null check (amount > 0),
  memo text not null default '',
  deal_id text references deals (id) on delete set null,
  party_id text references parties (id) on delete set null,
  status text not null default 'recorded'
    check (status in ('recorded', 'awaiting_approval', 'approved', 'rejected', 'withdrawn')),
  entry_date date not null default current_date,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists money_status_idx on money_entries (status, created_at desc);

create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  deal_id text references deals (id) on delete set null,
  assignee_id text references users (id) on delete set null,
  due_date date,
  done boolean not null default false,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tasks_open_idx on tasks (done, due_date);
