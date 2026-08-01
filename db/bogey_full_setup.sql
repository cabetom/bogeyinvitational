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


-- ============================================================
--  BOGEY INVITATIONAL — Datos 2025 (migrados del Excel CBI2025)
--  Negativos de AppSheet descartados; se conserva el stableford real.
--  Correr DESPUES de 01_schema.sql
-- ============================================================
begin;

-- EDICIONES
insert into editions (id,year,name,location,start_date,end_date,is_current) values
  ('ed-2024',2024,'Bogey Invitational 2024','Córdoba, Argentina',null,null,false),
  ('ed-2025',2025,'Bogey Invitational 2025','Córdoba, Argentina','2025-10-01','2025-10-04',true)
on conflict (id) do nothing;

-- JUGADORES
insert into players (id,full_name,nickname,email,is_admin) values
  ('b3f641c5','Perez Santandrea, Joaquín','el Pato','joaquin.perezsant@gmail.com',true),
  ('ea3f398d','Salvati, Stefano','el Tano','tanosalvati@gmail.com',true),
  ('79b16606','Herrera Vegas, Santiago',null,'Santiagohvegas@gmail.com',false),
  ('f90ac2fe','Elissondo, Manuel',null,'elissondomanuel@gmail.com',false),
  ('3bb9c26b','Carletti, Santiago',null,'Santiagocarletti91@gmail.com',false),
  ('b67c5809','Guazelli, Marcos',null,'marcosgua85@gmail.com',false),
  ('f33e881d','Haugaard, Agustín',null,'agustinhaugaard@gmail.com',false),
  ('c2994eca','Von Neufforge, Tomás',null,'tomasvonneufforge@gmail.com',false),
  ('84def555','Aztiria, Mariano',null,'Maztiria@gmail.com',false),
  ('b19dc80f','do Cobo, Tomás',null,'tomasdocobo@gmail.com',true),
  ('aa00b3b4','Chiarle, Alan',null,'Chiarlealan@gmail.com',false),
  ('ccb1afb6','Mathiasen, Nicolás',null,'nicomathiasen238@gmail.com',false),
  ('eb514ed4','Trueba, Manuel',null,'manueltrueba2016@gmail.com',false),
  ('d914e3b5','Lange, Octavio',null,null,false),
  ('af68e8bd','Farina, Luciano',null,null,false),
  ('2db215ee','Fernandez, Gonzalo',null,'gonjofer@gmail.com',false)
on conflict (id) do nothing;

-- EQUIPOS 2025
insert into teams (id,edition_id,name,captain_player_id,color) values
  ('pato-2025','ed-2025','Pato','b3f641c5','#B9722E'),
  ('tano-2025','ed-2025','Tano','ea3f398d','#8A3040')
on conflict (id) do nothing;

-- ROSTER 2025 (equipo; handicap a completar)
insert into edition_players (edition_id,player_id,team_id,handicap) values
  ('ed-2025','b3f641c5','pato-2025',null),
  ('ed-2025','ea3f398d','tano-2025',null),
  ('ed-2025','79b16606','pato-2025',null),
  ('ed-2025','f90ac2fe','pato-2025',null),
  ('ed-2025','3bb9c26b','pato-2025',null),
  ('ed-2025','b67c5809','pato-2025',null),
  ('ed-2025','f33e881d','pato-2025',null),
  ('ed-2025','c2994eca','pato-2025',null),
  ('ed-2025','84def555','pato-2025',null),
  ('ed-2025','b19dc80f','tano-2025',null),
  ('ed-2025','aa00b3b4','tano-2025',null),
  ('ed-2025','ccb1afb6','tano-2025',null),
  ('ed-2025','eb514ed4','tano-2025',null),
  ('ed-2025','d914e3b5','tano-2025',null),
  ('ed-2025','af68e8bd','tano-2025',null),
  ('ed-2025','2db215ee','tano-2025',null)
on conflict do nothing;

-- CANCHAS
insert into courses (id,name,location_url,par_total) values
  ('TER','El Terrón Golf Club','https://www.google.com/maps/place/El+Terr%C3%B3n+Golf+Club/@-31.2504247,-64.2877968,746m/data=!3m2!1e3!4b1!4m6!3m5!1s0x943283f5f0b44259:0xa86b158fed1228df!8m2!3d-31.2504293!4d-64.2852219!16s%2Fg%2F11jcdcsx6t?entry=ttu&g_ep=EgoyMDI1MDkyMi4wIKXMDSoASAFQAw%3D%3D',72),
  ('CBA','Córdoba Golf (Villa Allende)','https://www.google.com/maps/place/Cordoba+Golf+Club/@-31.2834854,-64.2971799,745m/data=!3m2!1e3!4b1!4m6!3m5!1s0x94329d20a7c68aa5:0xe2fdfed9358070b5!8m2!3d-31.28349!4d-64.294605!16s%2Fg%2F1tptrq3x?entry=ttu&g_ep=EgoyMDI1MDkyMi4wIKXMDSoASAFQAw%3D%3D',72),
  ('PLR','El Potrerillo de Larreta','https://www.google.com/maps/search/potrerillo+de+larreta+golf/@-31.643369,-64.4864644,1485m/data=!3m1!1e3?entry=ttu&g_ep=EgoyMDI1MDkyMi4wIKXMDSoASAFQAw%3D%3D',72),
  ('ELP','Estancia La Paz Golf','https://www.google.com/maps/place/Estancia+La+Paz+Golf/@-30.9537662,-64.2403502,2115m/data=!3m1!1e3!4m6!3m5!1s0x94327b167420a9ed:0xc0061f5851d9b84d!8m2!3d-30.9564506!4d-64.2329304!16s%2Fg%2F11w4m2h74y?entry=ttu&g_ep=EgoyMDI1MDkyMi4wIKXMDSoASAFQAw%3D%3D',72)
on conflict (id) do nothing;

-- FECHAS 2025
insert into fixtures (id,edition_id,day_no,date,course_id,modality) values
  ('f-2025-1','ed-2025',1,'2025-10-01','TER','fourball'),
  ('f-2025-2','ed-2025',2,'2025-10-02','CBA','fourball'),
  ('f-2025-3','ed-2025',3,'2025-10-03','PLR','fourball'),
  ('f-2025-4','ed-2025',4,'2025-10-04','ELP','individual')
on conflict (id) do nothing;

-- TARJETAS 2025 (stableford total; negativos de AppSheet descartados)
insert into scorecards (fixture_id,player_id,stableford,entry_mode) values
  ('f-2025-1','3bb9c26b',30,'total'),
  ('f-2025-1','f33e881d',28,'total'),
  ('f-2025-1','ea3f398d',30,'total'),
  ('f-2025-1','d914e3b5',29,'total'),
  ('f-2025-1','f90ac2fe',36,'total'),
  ('f-2025-1','84def555',27,'total'),
  ('f-2025-1','eb514ed4',40,'total'),
  ('f-2025-1','b19dc80f',34,'total'),
  ('f-2025-1','ccb1afb6',36,'total'),
  ('f-2025-1','2db215ee',32,'total'),
  ('f-2025-1','79b16606',31,'total'),
  ('f-2025-1','b67c5809',25,'total'),
  ('f-2025-1','b3f641c5',33,'total'),
  ('f-2025-1','aa00b3b4',33,'total'),
  ('f-2025-1','c2994eca',34,'total'),
  ('f-2025-1','af68e8bd',25,'total'),
  ('f-2025-2','ea3f398d',33,'total'),
  ('f-2025-2','eb514ed4',37,'total'),
  ('f-2025-2','af68e8bd',37,'total'),
  ('f-2025-2','3bb9c26b',30,'total'),
  ('f-2025-2','ccb1afb6',32,'total'),
  ('f-2025-2','aa00b3b4',35,'total'),
  ('f-2025-2','f33e881d',26,'total'),
  ('f-2025-2','c2994eca',23,'total'),
  ('f-2025-2','79b16606',26,'total'),
  ('f-2025-2','f90ac2fe',31,'total'),
  ('f-2025-2','84def555',24,'total'),
  ('f-2025-2','b67c5809',28,'total'),
  ('f-2025-2','d914e3b5',31,'total'),
  ('f-2025-2','b19dc80f',31,'total'),
  ('f-2025-2','2db215ee',24,'total'),
  ('f-2025-2','b3f641c5',34,'total'),
  ('f-2025-3','79b16606',34,'total'),
  ('f-2025-3','b19dc80f',34,'total'),
  ('f-2025-3','eb514ed4',40,'total'),
  ('f-2025-3','f90ac2fe',25,'total'),
  ('f-2025-3','c2994eca',41,'total'),
  ('f-2025-3','3bb9c26b',38,'total'),
  ('f-2025-3','ea3f398d',34,'total'),
  ('f-2025-3','d914e3b5',32,'total'),
  ('f-2025-3','84def555',39,'total'),
  ('f-2025-3','2db215ee',28,'total'),
  ('f-2025-3','ccb1afb6',35,'total'),
  ('f-2025-3','af68e8bd',30,'total'),
  ('f-2025-3','aa00b3b4',34,'total'),
  ('f-2025-3','b3f641c5',24,'total'),
  ('f-2025-3','f33e881d',36,'total'),
  ('f-2025-3','b67c5809',38,'total'),
  ('f-2025-4','f33e881d',28,'total'),
  ('f-2025-4','b19dc80f',32,'total'),
  ('f-2025-4','af68e8bd',26,'total'),
  ('f-2025-4','79b16606',36,'total'),
  ('f-2025-4','ccb1afb6',32,'total'),
  ('f-2025-4','ea3f398d',32,'total'),
  ('f-2025-4','f90ac2fe',28,'total'),
  ('f-2025-4','2db215ee',29,'total'),
  ('f-2025-4','3bb9c26b',39,'total'),
  ('f-2025-4','d914e3b5',25,'total'),
  ('f-2025-4','b67c5809',29,'total'),
  ('f-2025-4','aa00b3b4',35,'total'),
  ('f-2025-4','c2994eca',37,'total'),
  ('f-2025-4','84def555',31,'total'),
  ('f-2025-4','b3f641c5',30,'total'),
  ('f-2025-4','eb514ed4',43,'total')
on conflict (fixture_id,player_id) do nothing;

-- MATCHES 2025
insert into matches (id,fixture_id,modality,team_a_id,team_b_id) values
  ('m-ca147852','f-2025-1','fourball','pato-2025','tano-2025'),
  ('m-ac328b1c','f-2025-1','fourball','pato-2025','tano-2025'),
  ('m-2c79702c','f-2025-1','fourball','pato-2025','tano-2025'),
  ('m-fe150c7c','f-2025-1','fourball','pato-2025','tano-2025'),
  ('m-a4497e73','f-2025-2','fourball','pato-2025','tano-2025'),
  ('m-7de3224d','f-2025-2','fourball','pato-2025','tano-2025'),
  ('m-f196b728','f-2025-2','fourball','pato-2025','tano-2025'),
  ('m-0756f177','f-2025-2','fourball','pato-2025','tano-2025'),
  ('m-9a0c8f83','f-2025-3','fourball','pato-2025','tano-2025'),
  ('m-69639c01','f-2025-3','fourball','pato-2025','tano-2025'),
  ('m-b89db14c','f-2025-3','fourball','pato-2025','tano-2025'),
  ('m-de769848','f-2025-3','fourball','pato-2025','tano-2025'),
  ('m-2c5ae9cc','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-6376f36a','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-a591bbd2','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-c5ff9afa','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-8db0293f','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-b5d3075c','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-0fa60c8c','f-2025-4','individual','pato-2025','tano-2025'),
  ('m-8bc2eba9','f-2025-4','individual','pato-2025','tano-2025')
on conflict (id) do nothing;

insert into match_players (match_id,player_id,side) values
  ('m-ca147852','79b16606','A'),
  ('m-ca147852','b67c5809','A'),
  ('m-ca147852','ccb1afb6','B'),
  ('m-ca147852','d914e3b5','B'),
  ('m-ac328b1c','3bb9c26b','A'),
  ('m-ac328b1c','f33e881d','A'),
  ('m-ac328b1c','b19dc80f','B'),
  ('m-ac328b1c','2db215ee','B'),
  ('m-2c79702c','f90ac2fe','A'),
  ('m-2c79702c','84def555','A'),
  ('m-2c79702c','ea3f398d','B'),
  ('m-2c79702c','eb514ed4','B'),
  ('m-fe150c7c','b3f641c5','A'),
  ('m-fe150c7c','c2994eca','A'),
  ('m-fe150c7c','aa00b3b4','B'),
  ('m-fe150c7c','af68e8bd','B'),
  ('m-a4497e73','3bb9c26b','A'),
  ('m-a4497e73','84def555','A'),
  ('m-a4497e73','ccb1afb6','B'),
  ('m-a4497e73','2db215ee','B'),
  ('m-7de3224d','79b16606','A'),
  ('m-7de3224d','f33e881d','A'),
  ('m-7de3224d','aa00b3b4','B'),
  ('m-7de3224d','eb514ed4','B'),
  ('m-f196b728','f90ac2fe','A'),
  ('m-f196b728','c2994eca','A'),
  ('m-f196b728','ea3f398d','B'),
  ('m-f196b728','af68e8bd','B'),
  ('m-0756f177','b3f641c5','A'),
  ('m-0756f177','b67c5809','A'),
  ('m-0756f177','b19dc80f','B'),
  ('m-0756f177','d914e3b5','B'),
  ('m-9a0c8f83','79b16606','A'),
  ('m-9a0c8f83','f90ac2fe','A'),
  ('m-9a0c8f83','b19dc80f','B'),
  ('m-9a0c8f83','eb514ed4','B'),
  ('m-69639c01','b3f641c5','A'),
  ('m-69639c01','f33e881d','A'),
  ('m-69639c01','ccb1afb6','B'),
  ('m-69639c01','af68e8bd','B'),
  ('m-b89db14c','b67c5809','A'),
  ('m-b89db14c','84def555','A'),
  ('m-b89db14c','aa00b3b4','B'),
  ('m-b89db14c','2db215ee','B'),
  ('m-de769848','3bb9c26b','A'),
  ('m-de769848','c2994eca','A'),
  ('m-de769848','ea3f398d','B'),
  ('m-de769848','d914e3b5','B'),
  ('m-2c5ae9cc','f90ac2fe','A'),
  ('m-2c5ae9cc','2db215ee','B'),
  ('m-6376f36a','f33e881d','A'),
  ('m-6376f36a','ea3f398d','B'),
  ('m-a591bbd2','84def555','A'),
  ('m-a591bbd2','b19dc80f','B'),
  ('m-c5ff9afa','3bb9c26b','A'),
  ('m-c5ff9afa','af68e8bd','B'),
  ('m-8db0293f','c2994eca','A'),
  ('m-8db0293f','aa00b3b4','B'),
  ('m-b5d3075c','b3f641c5','A'),
  ('m-b5d3075c','eb514ed4','B'),
  ('m-0fa60c8c','b67c5809','A'),
  ('m-0fa60c8c','d914e3b5','B'),
  ('m-8bc2eba9','79b16606','A'),
  ('m-8bc2eba9','ccb1afb6','B')
on conflict do nothing;

insert into match_results (match_id,winner_side,winner_team_id,decided_by) values
  ('m-ca147852','B','tano-2025','manual'),
  ('m-ac328b1c','B','tano-2025','manual'),
  ('m-2c79702c','B','tano-2025','manual'),
  ('m-fe150c7c','A','pato-2025','manual'),
  ('m-a4497e73','A','pato-2025','manual'),
  ('m-7de3224d','B','tano-2025','manual'),
  ('m-f196b728','B','tano-2025','manual'),
  ('m-0756f177','A','pato-2025','manual'),
  ('m-9a0c8f83','B','tano-2025','manual'),
  ('m-69639c01','B','tano-2025','manual'),
  ('m-b89db14c','A','pato-2025','manual'),
  ('m-de769848','A','pato-2025','manual'),
  ('m-2c5ae9cc','B','tano-2025','manual'),
  ('m-6376f36a','B','tano-2025','manual'),
  ('m-a591bbd2','B','tano-2025','manual'),
  ('m-c5ff9afa','A','pato-2025','manual'),
  ('m-8db0293f','A','pato-2025','manual'),
  ('m-b5d3075c','B','tano-2025','manual'),
  ('m-0fa60c8c','A','pato-2025','manual'),
  ('m-8bc2eba9','A','pato-2025','manual')
on conflict (match_id) do nothing;

-- PREMIOS / PALMARES
insert into awards (edition_id,category,player_id,team_id,note) values
  ('ed-2024','teams',null,null,'Equipo Pato'),
  ('ed-2024','stableford','3bb9c26b',null,'Santiago Carletti'),
  ('ed-2025','teams',null,'tano-2025','Equipo Tano'),
  ('ed-2025','stableford','eb514ed4','tano-2025','Manuel Trueba'),
  ('ed-2025','mvp','eb514ed4','tano-2025','Manuel Trueba 4-0')
on conflict do nothing;

commit;
-- Resumen: 16 jugadores · 64 tarjetas · 20 matches