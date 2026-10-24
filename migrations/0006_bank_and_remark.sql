-- Bank pay on every bill, and a short remark when an expense is Other.
alter table sales drop constraint if exists sales_payment_chk;
alter table sales add constraint sales_payment_chk check (payment in ('cash', 'gpay', 'bank'));

alter table purchases drop constraint if exists purchases_payment_chk;
alter table purchases add constraint purchases_payment_chk check (payment in ('cash', 'gpay', 'bank'));

alter table expenses drop constraint if exists expenses_payment_chk;
alter table expenses add constraint expenses_payment_chk check (payment in ('cash', 'gpay', 'bank'));

alter table expenses add column if not exists remark text;

alter table expenses drop constraint if exists expenses_remark_chk;
alter table expenses add constraint expenses_remark_chk
  check (remark is null or char_length(remark) between 1 and 80);
