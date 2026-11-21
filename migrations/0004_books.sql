-- Books: legal entities with their own double-entry ledgers. Amounts are rupees, exact in numeric.

create table if not exists entities (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  kind text not null check (kind in ('boring_pe', 'spv', 'venture', 'impact_marrow', 'fund', 'other')),
  legal_form text not null default '',
  parent_id text references entities (id) on delete set null,
  active boolean not null default true,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists ledger_accounts (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{3,6}$'),
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (entity_id, code)
);

create table if not exists journal_entries (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  entry_date date not null,
  memo text not null,
  -- Where it came from: 'manual', or a module such as 'money' or 'payroll'.
  source_type text not null default 'manual',
  source_id text,
  reversal_of text references journal_entries (id),
  reversed_by text references journal_entries (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists journal_entity_date_idx on journal_entries (entity_id, entry_date desc, created_at desc);
-- An entry can be reversed once.
create unique index if not exists journal_reversal_once on journal_entries (reversal_of) where reversal_of is not null;

create table if not exists journal_lines (
  id bigserial primary key,
  entry_id text not null references journal_entries (id),
  account_id text not null references ledger_accounts (id),
  debit numeric(16, 2) not null default 0 check (debit >= 0),
  credit numeric(16, 2) not null default 0 check (credit >= 0),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index if not exists journal_lines_entry_idx on journal_lines (entry_id);
create index if not exists journal_lines_account_idx on journal_lines (account_id);

-- Integrity lives in the database, not only in the app: an entry must balance, have two lines
-- or more, and only touch accounts of its own entity. Checked when the statement commits.
create or replace function journal_check_entry() returns trigger language plpgsql as $$
declare
  d numeric; c numeric; n int; bad int;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) into d, c, n
    from journal_lines where entry_id = new.entry_id;
  if d <> c then raise exception 'journal entry % does not balance (% vs %)', new.entry_id, d, c; end if;
  if n < 2 then raise exception 'journal entry % needs at least two lines', new.entry_id; end if;
  select count(*) into bad from journal_lines l
    join ledger_accounts a on a.id = l.account_id
    join journal_entries e on e.id = l.entry_id
    where l.entry_id = new.entry_id and a.entity_id <> e.entity_id;
  if bad > 0 then raise exception 'journal entry % uses an account of another entity', new.entry_id; end if;
  return null;
end $$;

drop trigger if exists journal_balance_trigger on journal_lines;
create constraint trigger journal_balance_trigger after insert on journal_lines
  deferrable initially deferred for each row execute function journal_check_entry();

-- Posted books are never edited. Mistakes are corrected by a reversing entry.
create or replace function journal_lines_frozen() returns trigger language plpgsql as $$
begin raise exception 'posted journal lines cannot be changed'; end $$;

drop trigger if exists journal_lines_no_change on journal_lines;
create trigger journal_lines_no_change before update or delete on journal_lines
  for each row execute function journal_lines_frozen();

create or replace function journal_entries_frozen() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'posted journal entries cannot be deleted'; end if;
  if old.reversed_by is null and new.reversed_by is not null
     and new.entity_id = old.entity_id and new.entry_date = old.entry_date and new.memo = old.memo
     and new.source_type = old.source_type and new.source_id is not distinct from old.source_id
     and new.reversal_of is not distinct from old.reversal_of then
    return new;
  end if;
  raise exception 'posted journal entries cannot be changed';
end $$;

drop trigger if exists journal_entries_no_change on journal_entries;
create trigger journal_entries_no_change before update or delete on journal_entries
  for each row execute function journal_entries_frozen();

-- The two entities that exist from day one. Their charts of accounts are created on first use.
insert into entities (name, kind, legal_form) values
  ('Boring PE', 'boring_pe', ''),
  ('Impact Marrow', 'impact_marrow', '')
on conflict (name) do nothing;
