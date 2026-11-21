-- Money entries now belong to an entity and post to its books once they count.
alter table money_entries add column if not exists entity_id text references entities (id);
alter table money_entries add column if not exists journal_entry_id text references journal_entries (id);
update money_entries set entity_id = (select id from entities where kind = 'boring_pe' order by created_at limit 1)
 where entity_id is null;
