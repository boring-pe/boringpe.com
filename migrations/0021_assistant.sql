-- The assistant: conversations, the actions she proposes or takes, and what she may do for whom.

create table if not exists assistant_threads (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users (id) on delete cascade,
  workspace text not null default 'boring_pe',
  title text not null default 'New conversation',
  -- An AI service chosen for this conversation; null follows the portal's order.
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_threads_user_idx on assistant_threads (user_id, updated_at desc);

-- content holds blocks: {type:'text',text} | {type:'tool_use',id,name,input} | {type:'tool_result',tool_use_id,content}
create table if not exists assistant_messages (
  id bigserial primary key,
  thread_id text not null references assistant_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_thread_idx on assistant_messages (thread_id, id);

-- Every action she takes or asks to take. Nothing here is ever deleted.
create table if not exists assistant_actions (
  id text primary key default gen_random_uuid()::text,
  thread_id text not null references assistant_threads (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  tool_use_id text not null,
  tool text not null,
  category text not null,
  input jsonb not null,
  status text not null check (status in ('proposed', 'done', 'failed', 'rejected')),
  result text,
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists assistant_actions_user_idx on assistant_actions (user_id, created_at desc);

-- What the assistant may do: per role (scope 'role:admin') and per person (scope 'user:<id>').
create table if not exists assistant_policies (
  scope text not null,
  category text not null,
  mode text not null check (mode in ('off', 'ask', 'auto')),
  updated_by text references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (scope, category)
);

-- Portal-wide settings: her name, the order AI services are tried in, which roles may run her as a full agent.
create table if not exists assistant_settings (
  id boolean primary key default true check (id),
  name text not null default 'Assistant',
  providers text[] not null default '{}',
  full_agent_roles text[] not null default '{super_admin}',
  updated_at timestamptz not null default now()
);
insert into assistant_settings (id) values (true) on conflict do nothing;

-- Each person's own switch for full agent mode.
alter table users add column if not exists assistant_full_agent boolean not null default false;
