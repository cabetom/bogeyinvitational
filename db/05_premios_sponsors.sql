-- ============================================================
--  v1.2 — Carletti admin · premios editables · sponsors
--  Correr en el SQL Editor de Supabase.
-- ============================================================
begin;

-- Santiago Carletti como admin
update players set is_admin = true where id = '3bb9c26b';

-- Premios: título propio, qué se llevan, y sponsor del premio
alter table awards add column if not exists title text;
alter table awards add column if not exists prize text;
alter table awards add column if not exists sponsor text;

-- Sponsors del torneo
create table if not exists sponsors (
  id          text primary key default gen_random_uuid()::text,
  edition_id  text references editions(id) on delete cascade,
  name        text not null,
  logo_url    text,
  website     text,
  tier        text,          -- 'principal' | 'oficial' | 'colaborador'
  sort        int default 0,
  created_at  timestamptz default now()
);
alter table sponsors enable row level security;
drop policy if exists "read_auth" on sponsors;
create policy "read_auth" on sponsors for select to authenticated using (true);
drop policy if exists "write_auth" on sponsors;
create policy "write_auth" on sponsors for all to authenticated using (true) with check (true);

commit;
