-- How each person likes the portal: theme, accent colour, density and pinned pages.
alter table users add column if not exists prefs jsonb not null default '{}'::jsonb;
