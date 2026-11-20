-- Users double as the invite list: nobody can sign in unless a row exists and is active.
create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  name text,
  email text not null,
  email_verified timestamptz,
  image text,
  role text not null default 'lp'
    check (role in ('admin', 'partner', 'operator', 'founder', 'lp')),
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  password_hash text,
  must_change_password boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  -- Bumped on password change, reset, disable and "sign out everywhere".
  -- A session token carries the value it was issued with and dies when it differs.
  session_epoch integer not null default 0,
  last_sign_in_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx on users (lower(email));

-- Linked Google / LinkedIn identities. Provider tokens are deliberately not stored.
create table if not exists accounts (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users (id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  unique (provider, provider_account_id)
);

create index if not exists accounts_user_idx on accounts (user_id);

-- Magic-link tokens (Auth.js stores them hashed).
create table if not exists verification_token (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key (identifier, token)
);

-- Who changed access, when. Append only.
create table if not exists access_audit (
  id bigserial primary key,
  actor_id text,
  actor_email text,
  action text not null,
  target_email text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists access_audit_created_idx on access_audit (created_at desc);
