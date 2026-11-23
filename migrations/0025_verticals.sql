-- The portal is organised by Boring PE's four verticals: Build, Co-Build, Own and Boring Studio
-- (Enable), which manages all of Boring PE's activities. 'enable' is Boring Studio's id.
-- Invoices, money entries and tasks now carry a vertical; when none is chosen it comes from the
-- entity: Boring PE's own books are Boring Studio's, a venture's company takes the venture's vertical,
-- a holding's company is Own (or its pillar), and anything else is Boring Studio.

alter table invoices add column if not exists vertical text check (vertical in ('build', 'co_build', 'own', 'enable'));
alter table money_entries add column if not exists vertical text check (vertical in ('build', 'co_build', 'own', 'enable'));
alter table tasks add column if not exists vertical text check (vertical in ('build', 'co_build', 'own', 'enable'));

create or replace function vertical_of_entity(eid text) returns text language sql stable as $$
  select coalesce(
    (select 'enable' from entities where id = eid and kind = 'boring_pe'),
    (select pillar from ventures where entity_id = eid order by created_at limit 1),
    (select pillar from holdings where target_entity_id = eid order by created_at limit 1),
    'enable')
$$;

create or replace function set_vertical_from_entity() returns trigger language plpgsql as $$
begin
  if new.vertical is null then new.vertical := vertical_of_entity(new.entity_id); end if;
  return new;
end $$;

create or replace function set_task_vertical() returns trigger language plpgsql as $$
begin
  if new.vertical is null and new.deal_id is not null then
    new.vertical := (select case when pillar in ('build', 'co_build', 'own', 'enable') then pillar end from deals where id = new.deal_id);
  end if;
  return new;
end $$;

drop trigger if exists invoices_vertical_trigger on invoices;
create trigger invoices_vertical_trigger before insert on invoices for each row execute function set_vertical_from_entity();
drop trigger if exists money_entries_vertical_trigger on money_entries;
create trigger money_entries_vertical_trigger before insert on money_entries for each row execute function set_vertical_from_entity();
drop trigger if exists tasks_vertical_trigger on tasks;
create trigger tasks_vertical_trigger before insert on tasks for each row execute function set_task_vertical();

update invoices set vertical = vertical_of_entity(entity_id) where vertical is null;
update money_entries set vertical = vertical_of_entity(entity_id) where vertical is null;
update tasks t set vertical = d.pillar from deals d where d.id = t.deal_id and t.vertical is null;

update ledger_accounts set name = 'Boring Studio fee' where code = '5100' and name = 'Business House fee';
