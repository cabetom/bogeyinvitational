-- 10: Jugadores 2026 con matrícula (crea su login: usuario y contraseña inicial = matrícula).
-- Los que ya existían de 2025 se vinculan por id; los nuevos se crean sin equipo.
-- Requiere 09_login_matricula.sql. Idempotente.

-- Nuevos
insert into public.players (id, full_name) values
  ('pelaiafranco', 'Pelaia, Franco'),
  ('dolcegian',    'Dolce, Gian'),
  ('recareyfranco','Recarey, Franco')
on conflict (id) do nothing;

update public.players set full_name = 'Sparo, José Andrés' where id = 'sparojose';

-- Edición 2026 (Tomás mantiene el equipo de 2025: Tano)
insert into public.edition_players (edition_id, player_id, team_id) values
  ('ed-2026', 'b19dc80f',      'tano-2026'),
  ('ed-2026', 'pelaiafranco',  null),
  ('ed-2026', 'dolcegian',     null),
  ('ed-2026', 'recareyfranco', null)
on conflict (edition_id, player_id) do nothing;

-- Matrículas + logins
select public._upsert_matricula_login(id, m) from (values
  ('b3f641c5',      '102587'), -- Pérez Santandrea, Joaquín
  ('ea3f398d',      '99413'),  -- Salvati, Stefano
  ('aa00b3b4',      '177412'), -- Chiarle, Alan
  ('84def555',      '105744'), -- Aztiria, Mariano
  ('pelaiafranco',  '185812'),
  ('sparojose',     '92884'),
  ('dolcegian',     '125467'),
  ('recareyfranco', '125984'),
  ('b19dc80f',      '93266')   -- do Cobo, Tomás
) v(id, m);
