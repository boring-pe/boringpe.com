-- The Super Admin account is Rahul Mane.
update users
set name = 'Rahul Mane'
where role = 'super_admin'
  and (name is null or btrim(name) = '' or name = 'Super Admin');
