-- ============================================================
--  Ajuste v1.1 — hándicap por vuelta (para el stableford neto)
--  Correr en el SQL Editor de Supabase.
-- ============================================================
alter table scorecards add column if not exists handicap numeric(4,1);

-- (course_holes, vehicles, vehicle_trips, vehicle_seats y fixtures
--  ya existen desde 01_schema.sql — no hace falta crearlos de nuevo.)
