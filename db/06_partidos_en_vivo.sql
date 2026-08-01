-- ============================================================
--  v1.3 — Estado en vivo de los partidos (fourball match play)
--  Correr en el SQL Editor de Supabase.
-- ============================================================
alter table match_results add column if not exists status text default 'pendiente'; -- 'pendiente'|'en_juego'|'final'
alter table match_results add column if not exists up int;    -- + = Pato adelante, - = Tano, 0 = all square
alter table match_results add column if not exists thru int;  -- hoyos jugados

-- Los resultados históricos ya cerrados quedan como 'final'
update match_results set status = 'final' where winner_side is not null;

-- (opcional) realtime: si querés updates instantáneos sin recargar,
-- en Supabase → Database → Replication, activá la tabla match_results.
