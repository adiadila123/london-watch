-- London Community Watch - SQLite schema
-- Ports the constraints/tables that used to live in Supabase
-- (supabase-setup.sql, supabase-confirmations.sql, supabase-ratelimit.sql)
-- into plain SQLite, run once at app startup (see db.py init_db()).

create table if not exists reports (
  id            text primary key,
  category      text not null,
  description   text not null,
  photo_url     text,
  lat           real not null,
  lng           real not null,
  confirmations integer not null default 0,
  status        text not null default 'reported',
  created_at    text not null,

  check (category in (
    'Roads & Pavements',
    'Fly-tipping & Litter',
    'Street Lighting',
    'Parks & Green Spaces',
    'Public Transport',
    'Other'
  )),
  check (length(description) between 3 and 500),
  check (status in ('reported', 'in progress', 'resolved')),
  -- Rough bounding box for Greater London, rejects reports outside the city
  check (lat between 51.28 and 51.70 and lng between -0.52 and 0.34)
);

create index if not exists reports_created_at_idx on reports (created_at desc);
create index if not exists reports_lat_lng_idx on reports (lat, lng);

-- One row per (report, voter) pair - the dedup key for confirmations.
-- voter_hash is a salted hash of the requester's IP, computed in app.py,
-- never trusted from the client.
create table if not exists confirmations (
  report_id  text not null references reports (id) on delete cascade,
  voter_hash text not null,
  created_at text not null,
  primary key (report_id, voter_hash)
);

-- One row per accepted report submission, keyed by hashed IP, used to
-- count submissions in the trailing hour (see check_rate_limit in db.py).
create table if not exists report_rate_limits (
  id         integer primary key autoincrement,
  voter_hash text not null,
  created_at text not null
);

create index if not exists report_rate_limits_voter_created_idx
  on report_rate_limits (voter_hash, created_at);

-- Citizen accounts (profile.html) and the admin account (admin.html) share
-- this table, distinguished by is_admin - same split Supabase Auth had
-- (one auth.users table, admin identified by a specific email).
create table if not exists users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  nickname      text,
  is_admin      integer not null default 0,
  created_at    text not null
);
