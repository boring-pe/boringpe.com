-- Connected mailboxes (Gmail, Outlook, Zoho). Each belongs to one person; they may share it with the team.
create table if not exists mail_accounts (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'zoho', 'mock')),
  email text not null,
  tokens text not null,
  provider_account_id text,
  inbox_folder_id text,
  domain text,
  shared boolean not null default false,
  status text not null default 'active' check (status in ('active', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, provider, email)
);

-- One-time state for an OAuth round trip, bound to the person who started it.
create table if not exists oauth_states (
  state text primary key,
  user_id text not null references users (id) on delete cascade,
  provider text not null,
  verifier text,
  created_at timestamptz not null default now()
);
