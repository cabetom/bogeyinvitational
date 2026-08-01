-- ============================================================
--  Edición 2026 — Córdoba (pasa a ser la edición actual)
--  Correr en el SQL Editor de Supabase.
-- ============================================================
begin;

-- La 2026 pasa a ser la actual
update editions set is_current = false where is_current = true;

insert into editions (id, year, name, location, start_date, end_date, is_current) values
  ('ed-2026', 2026, 'Bogey Invitational 2026', 'Córdoba, Argentina', '2026-09-30', '2026-10-03', true)
on conflict (id) do update set is_current = excluded.is_current,
  start_date = excluded.start_date, end_date = excluded.end_date, location = excluded.location;

-- Cancha nueva: Valle Golf
insert into courses (id, name, location_url, par_total) values
  ('VAL', 'Valle Golf', 'https://www.google.com/maps/search/valle+golf+cordoba', 72)
on conflict (id) do nothing;

-- Jugador nuevo: Sparo, José (cargar email después desde el admin para que pueda entrar)
insert into players (id, full_name, nickname, email, is_admin) values
  ('sparojose', 'Sparo, José', null, null, false)
on conflict (id) do nothing;

-- Equipos 2026 (capitanes: Perez Santandrea = Pato, Salvati = Tano)
insert into teams (id, edition_id, name, captain_player_id, color) values
  ('pato-2026', 'ed-2026', 'Pato', 'b3f641c5', '#B9722E'),
  ('tano-2026', 'ed-2026', 'Tano', 'ea3f398d', '#8A3040')
on conflict (id) do nothing;

-- Roster confirmado 2026
insert into edition_players (edition_id, player_id, team_id, handicap) values
  ('ed-2026', 'b3f641c5', 'pato-2026', null),  -- Perez Santandrea
  ('ed-2026', 'sparojose', 'pato-2026', null), -- Sparo, José
  ('ed-2026', '3bb9c26b', 'pato-2026', null),  -- Carletti, Santiago
  ('ed-2026', '84def555', 'pato-2026', null),  -- Aztiria, Mariano
  ('ed-2026', 'ea3f398d', 'tano-2026', null),  -- Salvati, Stefano
  ('ed-2026', 'af68e8bd', 'tano-2026', null),  -- Farina, Luciano
  ('ed-2026', 'aa00b3b4', 'tano-2026', null)   -- Chiarle, Alan
on conflict (edition_id, player_id) do update set team_id = excluded.team_id;

-- Fechas 2026 (Día 4 individual como la tradición; se puede cambiar en Admin → Fechas)
insert into fixtures (id, edition_id, day_no, date, course_id, modality) values
  ('f-2026-1', 'ed-2026', 1, '2026-09-30', 'CBA', 'fourball'),    -- Córdoba Golf
  ('f-2026-2', 'ed-2026', 2, '2026-10-01', 'TER', 'fourball'),    -- El Terrón
  ('f-2026-3', 'ed-2026', 3, '2026-10-02', 'PLR', 'fourball'),    -- Potrerillo de Larreta
  ('f-2026-4', 'ed-2026', 4, '2026-10-03', 'VAL', 'individual')   -- Valle Golf
on conflict (id) do nothing;

commit;

-- Resumen: edición 2026 actual · 4 canchas (CBA, TER, PLR, VAL) · 7 jugadores (4 Pato / 3 Tano)
