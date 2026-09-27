-- 11: horario del primer tee time por fecha + nombres de canchas 2026. Ya aplicado.
alter table public.fixtures add column if not exists tee_time time;
update public.fixtures set tee_time = v.t::time from (values
  ('f-2026-1','09:30'),('f-2026-2','10:30'),('f-2026-3','12:00'),('f-2026-4','13:45')) v(id,t)
where fixtures.id = v.id;
update public.courses set name = 'Valle del Golf (Nuevo Country)' where id = 'VAL';
update public.courses set name = 'Estancia El Terrón Golf Club' where id = 'TER';
