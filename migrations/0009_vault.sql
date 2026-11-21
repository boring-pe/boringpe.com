-- BIDU Vault: documents stored in the database, optionally linked to an entity, venture or holding.
create table if not exists documents (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  category text not null check (category in ('legal', 'financial', 'tax', 'investment', 'hr', 'compliance', 'playbook', 'other')),
  entity_id text references entities (id) on delete set null,
  venture_id text references ventures (id) on delete set null,
  holding_id text references holdings (id) on delete set null,
  -- firm: the Boring PE team only. linked: also external people linked to the item it belongs to.
  visibility text not null default 'firm' check (visibility in ('firm', 'linked')),
  file_name text not null,
  mime text not null,
  size integer not null check (size > 0 and size <= 4194304),
  sha256 text not null,
  content bytea not null,
  uploaded_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(entity_id, venture_id, holding_id) <= 1)
);
create index if not exists documents_created_idx on documents (created_at desc);
