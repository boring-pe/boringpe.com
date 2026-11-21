-- External people (LPs, founders, operators, Co-Build partners) see only what is linked to them.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('super_admin', 'admin', 'partner', 'operator', 'cobuild_partner', 'founder', 'lp'));

create table if not exists access_scopes (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users (id) on delete cascade,
  -- entity: an SPV or venture company (its cap table, summary books and holdings);
  -- venture: a venture's monthly statements; holding: one investment's position.
  scope_type text not null check (scope_type in ('entity', 'venture', 'holding')),
  ref_id text not null,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, scope_type, ref_id)
);
create index if not exists access_scopes_user_idx on access_scopes (user_id);
