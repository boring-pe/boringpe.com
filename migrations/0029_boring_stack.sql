-- Boring Studio (Enable) is now Boring Stack: the books, saved records and the site's own wording.
-- Earlier names (Business House, Business Studio, Boring Studio) all become Boring Stack.

update ledger_accounts set name = 'Boring Stack fee'
 where code = '5100' and name in ('Business House fee', 'Business Studio fee', 'Boring Studio fee');

update journal_entries
   set memo = replace(replace(replace(memo, 'Business House', 'Boring Stack'), 'Business Studio', 'Boring Stack'), 'Boring Studio', 'Boring Stack')
 where memo like '%Business House%' or memo like '%Business Studio%' or memo like '%Boring Studio%';

update invoices
   set notes = replace(replace(replace(notes, 'Business House', 'Boring Stack'), 'Business Studio', 'Boring Stack'), 'Boring Studio', 'Boring Stack')
 where notes like '%Business House%' or notes like '%Business Studio%' or notes like '%Boring Studio%';

update invoice_lines
   set description = replace(replace(replace(description, 'Business House', 'Boring Stack'), 'Business Studio', 'Boring Stack'), 'Boring Studio', 'Boring Stack')
 where description like '%Business House%' or description like '%Business Studio%' or description like '%Boring Studio%';

update site_content
   set value = replace(replace(replace(value, 'Business House', 'Boring Stack'), 'Business Studio', 'Boring Stack'), 'Boring Studio', 'Boring Stack')
 where value like '%Business House%' or value like '%Business Studio%' or value like '%Boring Studio%';
