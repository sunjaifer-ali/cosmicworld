-- Gaming is a sale category, not a separate book.
alter table sales drop constraint if exists sales_category_chk;
alter table sales add constraint sales_category_chk
  check (category in ('cosmetics', 'fancy', 'accessories', 'mixed', 'gaming'));

insert into sales (sale_date, category, amount, payment, created_at)
select play_date, 'gaming', amount, payment, created_at
from gaming;

delete from gaming;
