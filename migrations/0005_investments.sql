-- Investments held by an entity, cap tables of our SPVs and ventures, and contributions to Impact Marrow.

create table if not exists holdings (
  id text primary key default gen_random_uuid()::text,
  holder_entity_id text not null references entities (id),
  name text not null,
  asset_class text not null check (asset_class in
    ('private_equity', 'startup', 'business', 'listed_equity', 'debt', 'real_estate', 'fund', 'gold', 'other')),
  pillar text not null default 'own' check (pillar in ('build', 'own', 'co_build')),
  target_entity_id text references entities (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'exited')),
  notes text not null default '',
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists holdings_holder_idx on holdings (holder_entity_id);

-- invest and income and exit move money and post to the holder's books; valuation only marks a value.
create table if not exists holding_txns (
  id text primary key default gen_random_uuid()::text,
  holding_id text not null references holdings (id),
  kind text not null check (kind in ('invest', 'income', 'exit', 'valuation')),
  txn_date date not null,
  amount numeric(16, 2) not null check (amount >= 0),
  -- For an exit: how much of the original cost this sale recovers.
  cost_recovered numeric(16, 2) not null default 0 check (cost_recovered >= 0),
  memo text not null default '',
  journal_entry_id text references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists holding_txns_holding_idx on holding_txns (holding_id, txn_date);

create table if not exists cap_table (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  holder_name text not null,
  holder_entity_id text references entities (id) on delete set null,
  instrument text not null default 'equity' check (instrument in
    ('equity', 'preference', 'convertible', 'safe', 'sweat', 'esop')),
  shares numeric(20, 4) not null check (shares > 0),
  invested numeric(16, 2) not null default 0 check (invested >= 0),
  issued_on date not null default current_date,
  notes text not null default '',
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cap_table_entity_idx on cap_table (entity_id);

-- Money given to Impact Marrow or its fund. from_entity_id null means Rahul Mane personally.
create table if not exists contributions (
  id text primary key default gen_random_uuid()::text,
  from_entity_id text references entities (id),
  to_entity_id text not null references entities (id),
  amount numeric(16, 2) not null check (amount > 0),
  contrib_date date not null,
  memo text not null default '',
  from_journal_id text references journal_entries (id),
  to_journal_id text not null references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Impact Marrow is funded through its own fund, which keeps separate books.
insert into entities (name, kind, parent_id)
  select 'Impact Marrow Fund', 'fund', id from entities where name = 'Impact Marrow'
on conflict (name) do nothing;
