-- Cosmic World counter book. Amounts only — no products, no customer names.
create table if not exists sales (
  id serial primary key,
  sale_date date not null,
  category text not null,
  amount numeric(12, 2) not null,
  payment text not null,
  created_at timestamptz not null default now(),
  constraint sales_category_chk check (category in ('cosmetics', 'fancy', 'toys', 'mixed')),
  constraint sales_payment_chk check (payment in ('cash', 'gpay')),
  constraint sales_amount_chk check (amount > 0)
);

create table if not exists purchases (
  id serial primary key,
  purchase_date date not null,
  category text not null,
  amount numeric(12, 2) not null,
  payment text not null,
  created_at timestamptz not null default now(),
  constraint purchases_category_chk check (category in ('cosmetics', 'fancy', 'toys', 'general')),
  constraint purchases_payment_chk check (payment in ('cash', 'gpay')),
  constraint purchases_amount_chk check (amount > 0)
);

create index if not exists sales_sale_date_idx on sales (sale_date);
create index if not exists purchases_purchase_date_idx on purchases (purchase_date);
