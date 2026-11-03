-- One automatic copy of the books per day, kept for three days. Passwords are not included.
create table if not exists shop_backups (
  backup_date date primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
