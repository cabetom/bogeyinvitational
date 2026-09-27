-- 13: el ranking se actualiza en vivo cuando alguien guarda una tarjeta + puntos en juego 2026. Ya aplicado.
-- 10 puntos = 3 días de fourball x 2 partidos (4 vs 4) + día 4 individual (4 partidos).
alter publication supabase_realtime add table public.scorecards;
update public.editions set total_points = 10 where id = 'ed-2026' and total_points is null;
