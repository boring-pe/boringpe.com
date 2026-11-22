-- The Super Admin seat is Rahul Mane, whatever placeholder was stored before.
update users
set name = 'Rahul Mane'
where role = 'super_admin';
