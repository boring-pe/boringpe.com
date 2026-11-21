-- In-portal notifications, optionally also sent by email.
create table if not exists notifications (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  href text not null default '/portal/notifications',
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;

alter table users add column if not exists notify_email boolean not null default true;
