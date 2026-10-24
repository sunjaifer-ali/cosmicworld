-- Bank pay is savings, not a bill payment.
-- An agent collects cash. About six months later the bank returns it with interest.
create table if not exists bank_savings (
  id serial primary key,
  entry_date date not null,
  direction text not null,
  amount numeric(12, 2) not null,
  interest numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint bank_savings_direction_chk check (direction in ('given', 'returned')),
  constraint bank_savings_amount_chk check (amount > 0),
  constraint bank_savings_interest_chk check (
    interest >= 0
    and (
      (direction = 'given' and interest = 0)
      or (direction = 'returned' and interest <= amount)
    )
  )
);

create index if not exists bank_savings_entry_date_idx on bank_savings (entry_date);
