-- A marked day. Sunday is a holiday even with no row. "worked" means the shop opened on a Sunday.
create table if not exists shop_days (
  day date primary key,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint shop_days_kind_chk check (kind in ('leave', 'worked'))
);
