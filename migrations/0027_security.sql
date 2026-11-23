-- Rate limits in fixed windows. Keys are keyed hashes, so no address or email is stored here.
create table if not exists rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  blocked integer not null default 0,
  primary key (bucket, key, window_start)
);

create index if not exists rate_limits_window_idx on rate_limits (window_start);
create index if not exists access_audit_action_idx on access_audit (action, created_at desc);
