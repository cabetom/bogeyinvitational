-- ============================================================
--  v1.5 — Puntos en juego por edición (total del Ryder)
--  Correr en el SQL Editor de Supabase.
-- ============================================================
alter table editions add column if not exists total_points int;

-- Ejemplos (ajustar): 2025 tuvo 20 partidos; 2026 se define cuando esté el fixture.
update editions set total_points = 20 where id = 'ed-2025' and total_points is null;
