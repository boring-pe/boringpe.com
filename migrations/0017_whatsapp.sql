-- WhatsApp shared inbox: one conversation per customer number, its messages and delivery status.
create table if not exists wa_contacts (
  wa_id text primary key check (wa_id ~ '^[0-9]{6,15}$'),
  name text,
  assigned_to text references users (id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  unread integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wa_contacts_recent_idx on wa_contacts (last_message_at desc);

create table if not exists wa_messages (
  id text primary key,
  wa_id text not null references wa_contacts (wa_id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  type text not null default 'text',
  body text not null default '',
  template_name text,
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error text,
  sent_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_thread_idx on wa_messages (wa_id, created_at);
