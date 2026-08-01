-- ============================================================
--  v1.4 — Realtime en partidos + Storage para fotos de perfil
--  Correr en el SQL Editor de Supabase.
-- ============================================================

-- 1) Realtime: publicar cambios de match_results (para el vivo instantáneo)
do $$
begin
  alter publication supabase_realtime add table match_results;
exception when duplicate_object then null;
end $$;

-- 2) Storage: bucket público de avatares
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Políticas: lectura pública, subida/edición para usuarios logueados
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');
