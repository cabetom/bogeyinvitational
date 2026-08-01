-- ============================================================
--  BOGEY INVITATIONAL — Esquema de base de datos (v1)
--  Postgres / Supabase · multi-edición · hoyo por hoyo + neto
--  Reglas anti-duplicado incluidas (ver UNIQUE / PK marcados).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- EDICIONES ----------
create table if not exists editions (
  id          text primary key,
  year        int  not null,
  name        text not null,
  location    text,
  start_date  date,
  end_date    date,
  is_current  boolean default false,
  created_at  timestamptz default now()
);

-- ---------- JUGADORES (identidad global) ----------
create table if not exists players (
  id            text primary key,
  full_name     text not null,
  nickname      text,
  email         text unique,
  avatar_url    text,
  is_admin      boolean default false,
  auth_user_id  uuid,               -- se linkea a auth.users al loguearse
  created_at    timestamptz default now()
);

-- ---------- EQUIPOS (por edición) ----------
create table if not exists teams (
  id                text primary key,
  edition_id        text not null references editions(id) on delete cascade,
  name              text not null,          -- 'Pato' / 'Tano'
  captain_player_id text references players(id),
  color             text,
  unique (edition_id, name)
);

-- ---------- ROSTER + EQUIPO + HANDICAP (por edición) ----------
create table if not exists edition_players (
  edition_id  text not null references editions(id) on delete cascade,
  player_id   text not null references players(id)  on delete cascade,
  team_id     text references teams(id),
  handicap    numeric(4,1),
  primary key (edition_id, player_id)
);

-- ---------- CANCHAS ----------
create table if not exists courses (
  id            text primary key,          -- 'TER'
  name          text not null,
  location_url  text,
  par_total     int default 72,
  holes         int default 18
);

-- ---------- HOYOS (par + stroke index)  → para el neto ----------
create table if not exists course_holes (
  course_id     text not null references courses(id) on delete cascade,
  hole_no       int  not null check (hole_no between 1 and 18),
  par           int  not null,
  stroke_index  int  not null check (stroke_index between 1 and 18),
  primary key (course_id, hole_no)
);

-- ---------- FECHAS ----------
create table if not exists fixtures (
  id          text primary key,          -- 'f-2025-1'
  edition_id  text not null references editions(id) on delete cascade,
  day_no      int  not null,
  date        date,
  course_id   text references courses(id),
  modality    text not null,             -- 'fourball' | 'individual'
  unique (edition_id, day_no)
);

-- ---------- TARJETAS  (1 por jugador y fecha)  [anti-dup #1] ----------
create table if not exists scorecards (
  id            text primary key default gen_random_uuid()::text,
  fixture_id    text not null references fixtures(id) on delete cascade,
  player_id     text not null references players(id)  on delete cascade,
  stableford    int,                       -- total (histórico o calculado)
  entry_mode    text default 'total',      -- 'total' | 'hole_by_hole'
  submitted_by  text references players(id),
  photo_url     text,
  created_at    timestamptz default now(),
  unique (fixture_id, player_id)           -- <= no se duplica la tarjeta
);

-- ---------- SCORES HOYO x HOYO  [anti-dup #2] ----------
create table if not exists hole_scores (
  scorecard_id  text not null references scorecards(id) on delete cascade,
  hole_no       int  not null check (hole_no between 1 and 18),
  strokes       int  not null,
  primary key (scorecard_id, hole_no)      -- <= un score por hoyo
);

-- ---------- MATCHES (pareja / individual por fecha) ----------
create table if not exists matches (
  id          text primary key,
  fixture_id  text not null references fixtures(id) on delete cascade,
  modality    text not null,               -- 'fourball' | 'individual'
  team_a_id   text references teams(id),
  team_b_id   text references teams(id)
);

create table if not exists match_players (
  match_id   text not null references matches(id) on delete cascade,
  player_id  text not null references players(id) on delete cascade,
  side       char(1) not null check (side in ('A','B')),  -- A=team_a  B=team_b
  primary key (match_id, player_id)
);

-- ---------- RESULTADO  (exactamente 1 por match)  [anti-dup #3] ----------
create table if not exists match_results (
  match_id        text primary key references matches(id) on delete cascade,
  winner_side     char(1) check (winner_side in ('A','B','H')),  -- H = empate
  winner_team_id  text references teams(id),
  margin          text,                     -- ej '3&2'
  decided_by      text default 'manual',    -- 'auto' (hoyo x hoyo) | 'manual'
  confirmed_by    text references players(id),
  created_at      timestamptz default now()
);

-- ---------- GASTOS / SPLITWISE ----------
create table if not exists expenses (
  id           text primary key default gen_random_uuid()::text,
  edition_id   text not null references editions(id) on delete cascade,
  description  text not null,
  amount       numeric(12,2) not null,
  currency     text default 'ARS',
  category     text,
  paid_by      text references players(id),
  spent_on     date,
  created_at   timestamptz default now()
);

create table if not exists expense_shares (
  expense_id  text not null references expenses(id) on delete cascade,
  player_id   text not null references players(id)  on delete cascade,
  share       numeric(12,2) not null,
  primary key (expense_id, player_id)
);

create table if not exists settlements (
  id          text primary key default gen_random_uuid()::text,
  edition_id  text not null references editions(id) on delete cascade,
  from_player text references players(id),
  to_player   text references players(id),
  amount      numeric(12,2) not null,
  settled_at  timestamptz
);

-- ---------- CAMIONETAS ----------
create table if not exists vehicles (
  id          text primary key default gen_random_uuid()::text,
  edition_id  text not null references editions(id) on delete cascade,
  name        text not null,
  plate       text,
  capacity    int default 5
);

create table if not exists vehicle_trips (
  id          text primary key default gen_random_uuid()::text,
  vehicle_id  text not null references vehicles(id) on delete cascade,
  fixture_id  text references fixtures(id),
  direction   text check (direction in ('ida','vuelta'))
);

create table if not exists vehicle_seats (
  trip_id    text not null references vehicle_trips(id) on delete cascade,
  player_id  text not null references players(id) on delete cascade,
  role       text default 'passenger',      -- 'driver' | 'passenger'
  primary key (trip_id, player_id)
);

-- ---------- PREMIOS ----------
create table if not exists awards (
  id          text primary key default gen_random_uuid()::text,
  edition_id  text not null references editions(id) on delete cascade,
  category    text not null,                 -- 'stableford'|'teams'|'mvp'|'longest_drive'|'pato_oro'...
  player_id   text references players(id),
  team_id     text references teams(id),
  note        text
);

-- ============================================================
--  RLS  (v1: lectura para logueados; escritura la afinamos
--        cuando conectemos el login. Para el amistoso de 16 alcanza.)
-- ============================================================
alter table editions       enable row level security;
alter table players        enable row level security;
alter table teams          enable row level security;
alter table edition_players enable row level security;
alter table courses        enable row level security;
alter table course_holes   enable row level security;
alter table fixtures       enable row level security;
alter table scorecards     enable row level security;
alter table hole_scores    enable row level security;
alter table matches        enable row level security;
alter table match_players  enable row level security;
alter table match_results  enable row level security;
alter table expenses       enable row level security;
alter table expense_shares enable row level security;
alter table settlements    enable row level security;
alter table vehicles       enable row level security;
alter table vehicle_trips  enable row level security;
alter table vehicle_seats  enable row level security;
alter table awards         enable row level security;

-- Lectura: cualquier usuario autenticado
do $$
declare t text;
begin
  for t in
    select unnest(array['editions','players','teams','edition_players','courses',
      'course_holes','fixtures','scorecards','hole_scores','matches','match_players',
      'match_results','expenses','expense_shares','settlements','vehicles',
      'vehicle_trips','vehicle_seats','awards'])
  loop
    execute format('drop policy if exists "read_auth" on %I;', t);
    execute format('create policy "read_auth" on %I for select to authenticated using (true);', t);
    execute format('drop policy if exists "write_auth" on %I;', t);
    execute format('create policy "write_auth" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
