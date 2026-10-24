-- Shop expenses. Whole amounts only, entered by the admin.
create table if not exists expenses (
  id serial primary key,
  expense_date date not null,
  category text not null,
  amount numeric(12, 2) not null,
  payment text not null,
  created_at timestamptz not null default now(),
  constraint expenses_category_chk check (category in ('rent', 'salary', 'electricity', 'transport', 'other')),
  constraint expenses_payment_chk check (payment in ('cash', 'gpay')),
  constraint expenses_amount_chk check (amount > 0)
);

create index if not exists expenses_expense_date_idx on expenses (expense_date);
