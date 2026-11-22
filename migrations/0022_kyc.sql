-- Know your customer: a case per person or entity, the checks run on it, and consent links that let
-- the person sign in to DigiLocker or Entity Locker themselves. No full Aadhaar number is ever stored.

create table if not exists kyc_cases (
  id text primary key default gen_random_uuid()::text,
  subject_type text not null check (subject_type in ('person', 'entity')),
  subject_name text not null,
  email text,
  workspace text not null default 'boring_pe' check (workspace in ('personal', 'boring_pe', 'impact_marrow')),
  -- What this case is about in the portal, when it is one of ours.
  party_id text references parties (id) on delete set null,
  user_id text references users (id) on delete set null,
  employee_id text references employees (id) on delete set null,
  entity_id text references entities (id) on delete set null,
  -- For a beneficial owner: the entity case it belongs to, and the share held.
  parent_case_id text references kyc_cases (id) on delete cascade,
  ownership_bps integer,
  company boolean not null default true,
  gst_registered boolean not null default false,
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'review', 'verified', 'rejected', 'expired')),
  risk text not null default 'low' check (risk in ('low', 'medium', 'high')),
  risk_factors jsonb not null default '{}'::jsonb,
  decision_note text not null default '',
  verified_on date,
  rekyc_due date,
  created_by text references users (id) on delete set null,
  decided_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kyc_cases_status_idx on kyc_cases (status, updated_at desc);

create table if not exists kyc_checks (
  id bigserial primary key,
  case_id text not null references kyc_cases (id) on delete cascade,
  kind text not null,
  -- Shown to reviewers: masked where the law requires (Aadhaar shows only its last four digits).
  value text not null default '',
  status text not null check (status in ('pass', 'fail', 'pending', 'review')),
  source text not null check (source in ('format', 'digilocker', 'entity_locker', 'provider', 'manual')),
  detail text not null default '',
  -- What the source returned, with identifiers masked; never a full Aadhaar number or document file.
  data jsonb not null default '{}'::jsonb,
  name_score integer,
  checked_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists kyc_checks_case_idx on kyc_checks (case_id, created_at);

-- A link sent to the person or entity so they can share documents from DigiLocker or Entity Locker.
create table if not exists kyc_links (
  token_hash text primary key,
  case_id text not null references kyc_cases (id) on delete cascade,
  locker text not null check (locker in ('digilocker', 'entity_locker')),
  verifier text,
  state text unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists kyc_events (
  id bigserial primary key,
  case_id text not null references kyc_cases (id) on delete cascade,
  actor_email text,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
