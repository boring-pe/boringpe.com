-- Two-step sign-in, trusted devices, and a password vault.

alter table users add column if not exists totp_secret text;          -- sealed with the integrations key
alter table users add column if not exists totp_enabled boolean not null default false;
alter table users add column if not exists totp_last_step bigint;     -- a code is never accepted twice
alter table users add column if not exists recovery_hashes text[] not null default '{}';

-- Browsers someone chose to trust for 30 days, so they are not asked for a code each time.
create table if not exists trusted_devices (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists trusted_devices_user_idx on trusted_devices (user_id);

create table if not exists security_settings (
  id boolean primary key default true check (id),
  require_2fa_roles text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into security_settings (id) values (true) on conflict do nothing;

-- Logins and credentials kept for the team. Secrets and notes are sealed (AES-256-GCM).
create table if not exists vault_secrets (
  id text primary key default gen_random_uuid()::text,
  workspace text not null default 'boring_pe' check (workspace in ('personal', 'boring_pe', 'impact_marrow')),
  title text not null,
  username text not null default '',
  url text not null default '',
  secret text not null,
  notes text,
  owner_id text not null references users (id) on delete cascade,
  -- private: only the owner. roles: the owner plus these roles inside the workspace.
  share text not null default 'private' check (share in ('private', 'roles')),
  roles text[] not null default '{}',
  updated_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vault_secret_events (
  id bigserial primary key,
  secret_id text not null references vault_secrets (id) on delete cascade,
  actor_email text,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists vault_secret_events_idx on vault_secret_events (secret_id, created_at desc);
