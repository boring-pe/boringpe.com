-- People: employees of each entity, leave, and monthly pay runs that post to the books.

insert into ledger_accounts (entity_id, code, name, type)
  select id, '2400', 'Other deductions payable', 'liability' from entities
on conflict (entity_id, code) do nothing;

create table if not exists employees (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text,
  -- When set, this signed-in person sees their own payslips and leave.
  user_id text unique references users (id) on delete set null,
  entity_id text not null references entities (id),
  department text not null default '',
  designation text not null default '',
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'intern', 'consultant')),
  join_date date not null,
  exit_date date,
  monthly_gross numeric(16, 2) not null check (monthly_gross >= 0),
  tds_bps integer not null default 0 check (tds_bps between 0 and 10000),
  other_deduction numeric(16, 2) not null default 0 check (other_deduction >= 0),
  status text not null default 'active' check (status in ('active', 'exited')),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (exit_date is null or exit_date >= join_date)
);
create index if not exists employees_entity_idx on employees (entity_id);

create table if not exists leave_requests (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id),
  kind text not null check (kind in ('casual', 'sick', 'earned', 'unpaid')),
  from_date date not null,
  to_date date not null,
  days integer not null check (days > 0),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by text references users (id) on delete set null,
  decided_by text references users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);
create index if not exists leave_employee_idx on leave_requests (employee_id, from_date);

create table if not exists pay_runs (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  period date not null check (extract(day from period) = 1),
  status text not null default 'draft' check (status in ('draft', 'posted', 'paid')),
  gross numeric(16, 2) not null default 0,
  tds numeric(16, 2) not null default 0,
  other numeric(16, 2) not null default 0,
  net numeric(16, 2) not null default 0,
  journal_entry_id text references journal_entries (id),
  pay_journal_id text references journal_entries (id),
  prepared_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entity_id, period)
);

create table if not exists payslips (
  id text primary key default gen_random_uuid()::text,
  pay_run_id text not null references pay_runs (id) on delete cascade,
  employee_id text not null references employees (id),
  days_in_month integer not null,
  payable_days integer not null,
  lop_days integer not null default 0,
  monthly_gross numeric(16, 2) not null,
  gross numeric(16, 2) not null,
  tds numeric(16, 2) not null,
  other numeric(16, 2) not null,
  net numeric(16, 2) not null,
  unique (pay_run_id, employee_id)
);
