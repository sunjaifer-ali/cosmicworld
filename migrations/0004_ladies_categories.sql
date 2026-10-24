-- Ladies shop only. Older toy rows become accessories.
update sales set category = 'accessories' where category = 'toys';
update purchases set category = 'accessories' where category = 'toys';

alter table sales drop constraint if exists sales_category_chk;
alter table sales add constraint sales_category_chk
  check (category in ('cosmetics', 'fancy', 'accessories', 'mixed'));

alter table purchases drop constraint if exists purchases_category_chk;
alter table purchases add constraint purchases_category_chk
  check (category in ('cosmetics', 'fancy', 'accessories', 'general'));
