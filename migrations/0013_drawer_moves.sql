-- Cash the owner takes out of the drawer, or puts back. Not a purchase and not an expense.
create table if not exists drawer_moves (
  id serial primary key,
  entry_date date not null,
  direction text not null,
  amount numeric(12, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  constraint drawer_moves_direction_chk check (direction in ('taken', 'put')),
  constraint drawer_moves_amount_chk check (amount > 0)
);

create index if not exists drawer_moves_entry_date_idx on drawer_moves (entry_date);
