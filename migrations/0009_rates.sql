-- Keep-rates the shop can change. Stored as basis points: 15% is 1500, 42.5% is 4250.
create table if not exists shop_rates (
  category text primary key,
  basis integer not null,
  constraint shop_rates_basis_chk check (basis >= 0 and basis <= 10000)
);

insert into shop_rates (category, basis) values
  ('cosmetics', 1500),
  ('fancy', 7000),
  ('accessories', 7000),
  ('mixed', 4250),
  ('gaming', 10000)
on conflict (category) do nothing;

create table if not exists shop_settings (
  id integer primary key,
  mixed_average boolean not null default true,
  constraint shop_settings_id_chk check (id = 1)
);

insert into shop_settings (id, mixed_average) values (1, true)
on conflict (id) do nothing;
