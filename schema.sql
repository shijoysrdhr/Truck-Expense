-- Run once: psql "$DATABASE_URL" -f schema.sql
create table if not exists trucks (
  id serial primary key,
  number text not null unique,
  active boolean not null default true
);

create table if not exists drivers (
  id serial primary key,
  name text not null,
  phone text not null unique,          -- 9198XXXXXXXX
  telegram_chat_id text unique,        -- filled when the driver shares his number on Telegram
  active boolean not null default true
);

create table if not exists media (
  id serial primary key,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists trips (
  id serial primary key,
  truck_id int not null references trucks(id),
  driver_id int not null references drivers(id),
  from_place text, to_place text, party text,
  start_km numeric, end_km numeric,
  freight numeric not null default 0,
  freight_received_by text not null default 'pending'
    check (freight_received_by in ('driver','owner','pending')),
  status text not null default 'open' check (status in ('open','ended','approved')),
  start_photo_id int references media(id),
  end_photo_id int references media(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists one_open_trip_per_driver on trips(driver_id) where status = 'open';

create table if not exists expenses (
  id serial primary key,
  trip_id int references trips(id) on delete cascade,
  truck_id int references trucks(id),   -- null = shared cost
  driver_id int references drivers(id), -- null = entered by owner
  category text not null,
  amount numeric not null check (amount > 0),
  paid_by text not null default 'driver' check (paid_by in ('driver','owner')),
  note text,
  photo_id int references media(id),
  spent_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at timestamptz not null default now()
);

-- advance = owner gave cash to driver, return = driver handed cash back
create table if not exists cash_moves (
  id serial primary key,
  driver_id int not null references drivers(id),
  trip_id int references trips(id) on delete set null,
  kind text not null check (kind in ('advance','return')),
  amount numeric not null check (amount > 0),
  note text,
  source text not null default 'owner' check (source in ('driver','owner')),
  moved_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  phone text primary key,
  state text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists processed_messages (
  id text primary key,
  at timestamptz not null default now()
);

-- upgrade from the first version:
-- alter table drivers add column if not exists telegram_chat_id text unique;
