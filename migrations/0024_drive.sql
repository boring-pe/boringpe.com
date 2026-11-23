-- The vault becomes a drive: folders inside each workspace, and files only their uploader sees.

create table if not exists doc_folders (
  id text primary key default gen_random_uuid()::text,
  workspace text not null default 'boring_pe' check (workspace in ('personal', 'boring_pe', 'impact_marrow')),
  parent_id text references doc_folders (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists doc_folders_name_idx on doc_folders (workspace, coalesce(parent_id, ''), lower(name));

alter table documents add column if not exists folder_id text references doc_folders (id) on delete set null;
alter table documents drop constraint if exists documents_visibility_check;
alter table documents add constraint documents_visibility_check check (visibility in ('firm', 'linked', 'private'));
