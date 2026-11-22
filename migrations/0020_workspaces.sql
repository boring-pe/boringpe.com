-- Three workspaces: Rahul Mane's personal one, Boring PE and Impact Marrow.
-- Entities, tasks, mailboxes and vault documents each belong to one workspace. People are given
-- Boring PE, Impact Marrow or both; the personal workspace is the Super Admin's alone.

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check
  check (kind in ('boring_pe', 'spv', 'venture', 'impact_marrow', 'fund', 'personal', 'other'));

alter table entities add column if not exists workspace text not null default 'boring_pe';
alter table entities drop constraint if exists entities_workspace_check;
alter table entities add constraint entities_workspace_check check (workspace in ('personal', 'boring_pe', 'impact_marrow'));
update entities set workspace = 'impact_marrow' where kind in ('impact_marrow', 'fund') and workspace = 'boring_pe';
update entities set workspace = 'personal' where kind = 'personal';

insert into entities (name, kind, legal_form, workspace)
values ('Rahul Mane (Personal)', 'personal', 'Individual', 'personal')
on conflict (name) do nothing;

-- Which of Boring PE and Impact Marrow a seat can enter. The Super Admin enters all three.
alter table users add column if not exists workspaces text[] not null default '{boring_pe}';
alter table users drop constraint if exists users_workspaces_check;
alter table users add constraint users_workspaces_check check (workspaces <@ array['boring_pe', 'impact_marrow']::text[]);
-- The workspace each person last chose; 'all' is the Super Admin's combined view.
alter table users add column if not exists current_workspace text;

alter table tasks add column if not exists workspace text not null default 'boring_pe';
alter table tasks drop constraint if exists tasks_workspace_check;
alter table tasks add constraint tasks_workspace_check check (workspace in ('personal', 'boring_pe', 'impact_marrow'));

alter table mail_accounts add column if not exists workspace text not null default 'boring_pe';
alter table mail_accounts drop constraint if exists mail_accounts_workspace_check;
alter table mail_accounts add constraint mail_accounts_workspace_check check (workspace in ('personal', 'boring_pe', 'impact_marrow'));

alter table documents add column if not exists workspace text not null default 'boring_pe';
alter table documents drop constraint if exists documents_workspace_check;
alter table documents add constraint documents_workspace_check check (workspace in ('personal', 'boring_pe', 'impact_marrow'));
update documents d set workspace = e.workspace from entities e where e.id = d.entity_id and d.workspace <> e.workspace;

-- Gifts from Rahul personally now come from the personal entity's books.
update contributions set from_entity_id = (select id from entities where kind = 'personal' order by created_at limit 1)
 where from_entity_id is null;

-- The database itself refuses a posting by someone outside the entity's workspace, whichever page
-- or module it came from. Postings with no person behind them (webhooks, system jobs) pass.
create or replace function journal_entries_workspace() returns trigger language plpgsql as $$
declare
  ws text;
  r text;
  mine text[];
begin
  if new.created_by is null then return new; end if;
  select workspace into ws from entities where id = new.entity_id;
  select role, workspaces into r, mine from users where id = new.created_by;
  if r is null or r = 'super_admin' then return new; end if;
  if ws = 'personal' or not (ws = any(mine)) then
    raise exception 'This entity is outside your workspaces.';
  end if;
  return new;
end $$;
drop trigger if exists journal_entries_workspace_trigger on journal_entries;
create trigger journal_entries_workspace_trigger before insert on journal_entries
  for each row execute function journal_entries_workspace();
