-- Gaming centre takings. The whole amount belongs to the shop.
create table if not exists gaming (
  id serial primary key,
  play_date date not null,
  amount numeric(12, 2) not null,
  payment text not null,
  created_at timestamptz not null default now(),
  constraint gaming_payment_chk check (payment in ('cash', 'gpay')),
  constraint gaming_amount_chk check (amount > 0)
);

create index if not exists gaming_play_date_idx on gaming (play_date);
