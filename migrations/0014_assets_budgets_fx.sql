-- Fixed assets and depreciation, budgets, and foreign-currency amounts.

insert into ledger_accounts (entity_id, code, name, type)
  select e.id, a.code, a.name, a.type from entities e,
    (values ('1600', 'Fixed assets', 'asset'), ('1690', 'Accumulated depreciation', 'asset'),
            ('5200', 'Depreciation', 'expense'), ('4910', 'Exchange gain', 'income'), ('5910', 'Exchange loss', 'expense'))
      as a(code, name, type)
on conflict (entity_id, code) do nothing;

create table if not exists fixed_assets (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  name text not null,
  category text not null,
  purchase_date date not null,
  cost numeric(16, 2) not null check (cost > 0),
  salvage numeric(16, 2) not null default 0 check (salvage >= 0),
  method text not null check (method in ('slm', 'wdv')),
  life_months integer not null default 0 check (life_months >= 0),
  wdv_bps integer not null default 0 check (wdv_bps between 0 and 10000),
  status text not null default 'active' check (status in ('active', 'disposed')),
  disposed_on date,
  proceeds numeric(16, 2),
  purchase_journal_id text references journal_entries (id),
  disposal_journal_id text references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (salvage < cost)
);
create index if not exists fixed_assets_entity_idx on fixed_assets (entity_id);

create table if not exists depreciation_runs (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  period date not null check (extract(day from period) = 1),
  total numeric(16, 2) not null,
  journal_entry_id text references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entity_id, period)
);

create table if not exists asset_depreciation (
  run_id text not null references depreciation_runs (id),
  asset_id text not null references fixed_assets (id),
  amount numeric(16, 2) not null check (amount > 0),
  primary key (run_id, asset_id)
);

create table if not exists budgets (
  account_id text not null references ledger_accounts (id),
  month date not null check (extract(day from month) = 1),
  amount numeric(16, 2) not null check (amount >= 0),
  updated_by text references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (account_id, month)
);

-- Foreign currency: the books stay in rupees; the original currency, amount and rate are kept beside them.
alter table journal_entries add column if not exists currency text not null default 'INR';
alter table journal_entries add column if not exists fx_rate numeric(18, 6);
alter table money_entries add column if not exists currency text not null default 'INR';
alter table money_entries add column if not exists fx_amount numeric(16, 2);
alter table money_entries add column if not exists fx_rate numeric(18, 6);
alter table invoices add column if not exists currency text not null default 'INR';
alter table invoices add column if not exists fx_rate numeric(18, 6);
alter table invoices add column if not exists fx_total numeric(16, 2);
alter table invoices add column if not exists fx_settled numeric(16, 2) not null default 0;
alter table invoice_lines add column if not exists fx_rate_amount numeric(16, 2);
alter table invoice_lines add column if not exists fx_amount numeric(16, 2);
alter table invoice_receipts add column if not exists fx_amount numeric(16, 2);
alter table invoice_receipts add column if not exists fx_gain numeric(16, 2) not null default 0;

-- Keep currency and rate frozen with the rest of a posted entry.
create or replace function journal_entries_frozen() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'posted journal entries cannot be deleted'; end if;
  if old.reversed_by is null and new.reversed_by is not null
     and new.entity_id = old.entity_id and new.entry_date = old.entry_date and new.memo = old.memo
     and new.source_type = old.source_type and new.source_id is not distinct from old.source_id
     and new.reversal_of is not distinct from old.reversal_of
     and new.currency = old.currency and new.fx_rate is not distinct from old.fx_rate then
    return new;
  end if;
  raise exception 'posted journal entries cannot be changed';
end $$;
