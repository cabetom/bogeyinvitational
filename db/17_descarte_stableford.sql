-- 17: descarte de tarjetas en el ranking stableford (cuentan las mejores N - descarte). 2026: 4 fechas, se descarta 1. Ya aplicado.
alter table public.editions add column if not exists stableford_drop integer not null default 0 check (stableford_drop between 0 and 3);
update public.editions set stableford_drop = 1 where id = 'ed-2026';
