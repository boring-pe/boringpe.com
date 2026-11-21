-- Integrations hub: encrypted credentials per service, an activity log, API keys and outgoing webhooks.
create table if not exists integrations (
  provider text primary key,
  config jsonb not null default '{}'::jsonb,
  -- AES-256-GCM sealed JSON of secret fields; never sent to the browser.
  secrets text,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  last_checked_at timestamptz,
  last_error text,
  updated_by text references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists integration_log (
  id bigserial primary key,
  provider text not null,
  action text not null,
  ok boolean not null,
  message text not null default '',
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists integration_log_created_idx on integration_log (created_at desc);

create table if not exists api_keys (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null,
  created_by text not null references users (id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists webhook_endpoints (
  id text primary key default gen_random_uuid()::text,
  url text not null,
  secret text not null,
  events text[] not null,
  active boolean not null default true,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id bigserial primary key,
  endpoint_id text not null references webhook_endpoints (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status_code integer,
  ok boolean not null default false,
  error text,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_endpoint_idx on webhook_deliveries (endpoint_id, created_at desc);
