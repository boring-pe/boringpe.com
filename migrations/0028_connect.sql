-- Public "Connect with Us" requests from boringpe.com.
create table if not exists connect_requests (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  organisation text not null,
  email text not null,
  phone text not null,
  topic text not null,
  note text not null default '',
  slot_at timestamptz not null,
  whatsapp boolean not null default false,
  created_at timestamptz not null default now()
);
