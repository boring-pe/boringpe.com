-- Bank statements imported per entity, matched line by line to the books' bank account.
create table if not exists bank_imports (
  id text primary key default gen_random_uuid()::text,
  entity_id text not null references entities (id),
  file_name text not null,
  added integer not null,
  duplicates integer not null,
  skipped integer not null,
  imported_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists bank_lines (
  id text primary key default gen_random_uuid()::text,
  -- Statement order, so the closing balance is the last line even when several share a date.
  seq bigserial,
  entity_id text not null references entities (id),
  import_id text not null references bank_imports (id),
  line_key text not null,
  txn_date date not null,
  description text not null default '',
  ref text not null default '',
  amount numeric(16, 2) not null check (amount <> 0),
  balance numeric(16, 2),
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'posted', 'ignored')),
  journal_line_id bigint references journal_lines (id),
  journal_entry_id text references journal_entries (id),
  decided_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entity_id, line_key),
  check ((status in ('matched', 'posted')) = (journal_line_id is not null))
);
-- A line in the books can stand for one statement line only.
create unique index if not exists bank_lines_journal_once on bank_lines (journal_line_id) where journal_line_id is not null;
create index if not exists bank_lines_entity_idx on bank_lines (entity_id, status, txn_date);
