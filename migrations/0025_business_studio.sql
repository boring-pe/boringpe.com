-- Business House is now Business Studio. Build, Co-Build and Own stay activities of Boring PE.
update ledger_accounts
set name = 'Business Studio fee'
where code = '5100' and name = 'Business House fee';

update journal_entries
set memo = replace(memo, 'Business House', 'Business Studio')
where memo like '%Business House%';

update invoices
set notes = replace(notes, 'Business House', 'Business Studio')
where notes like '%Business House%';

update invoice_lines
set description = replace(description, 'Business House', 'Business Studio')
where description like '%Business House%';

update site_content
set value = replace(value, 'Business House', 'Business Studio')
where value like '%Business House%';
