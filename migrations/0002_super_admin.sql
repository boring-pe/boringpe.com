-- Super Admin sits above Admin.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('super_admin', 'admin', 'partner', 'operator', 'founder', 'lp'));

-- Requests that wait for the Super Admin before anything happens.
create table if not exists approvals (
  id text primary key default gen_random_uuid()::text,
  kind text not null
    check (kind in ('access', 'deal', 'payment', 'document', 'content', 'other')),
  title text not null,
  detail text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  -- Lets a later module point an approval at the thing it gates (a deal, a payment...).
  ref_type text,
  ref_id text,
  requested_by text not null references users (id),
  requested_by_email text not null,
  decided_by_email text,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists approvals_status_idx on approvals (status, created_at desc);
create index if not exists approvals_requester_idx on approvals (requested_by, created_at desc);

-- Editable public copy for the two sites. A missing row means "use the default in code".
create table if not exists site_content (
  site text not null check (site in ('boringpe', 'rahulmane')),
  key text not null,
  value text not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (site, key)
);

-- Private to the Super Admin who wrote them.
create table if not exists personal_notes (
  id text primary key default gen_random_uuid()::text,
  owner_id text not null references users (id) on delete cascade,
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_notes_owner_idx on personal_notes (owner_id, pinned desc, updated_at desc);
