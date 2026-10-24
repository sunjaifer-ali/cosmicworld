-- Counter logins. One admin, many staff. password_hash is a scrypt string, never a password.
create table if not exists shop_accounts (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  role text not null,
  created_at timestamptz not null default now(),
  constraint shop_accounts_role_chk check (role in ('admin', 'staff'))
);

create unique index if not exists shop_accounts_one_admin
  on shop_accounts (role)
  where role = 'admin';

create table if not exists shop_sessions (
  token_hash text primary key,
  account_id text not null references shop_accounts (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shop_sessions_account_idx on shop_sessions (account_id);
