-- Optional supplier on a whole purchase bill, a nightly cash count, and GPay that has reached the bank.
alter table purchases add column if not exists supplier text;

create table if not exists drawer_counts (
  count_date date primary key,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint drawer_counts_amount_chk check (amount >= 0)
);

create table if not exists gpay_received (
  id serial primary key,
  entry_date date not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint gpay_received_amount_chk check (amount > 0)
);

create index if not exists gpay_received_entry_date_idx on gpay_received (entry_date);
