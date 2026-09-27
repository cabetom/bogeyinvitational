-- 15: autoregistro por matrícula, equipo "de siempre", hándicap de we.golf y permisos de escritura. Ya aplicado.
-- El registro en sí lo hace la Edge Function supabase/functions/wegolf (valida la matrícula y el nombre contra we.golf).

alter table public.players add column if not exists team_name text check (team_name in ('Pato','Tano'));
alter table public.players add column if not exists handicap_index numeric;
alter table public.players add column if not exists handicap_club text;
alter table public.players add column if not exists handicap_updated_at timestamptz;
alter table public.players add column if not exists self_registered boolean not null default false;

-- equipo = el de su última edición
update public.players p set team_name = sub.name
from (
  select distinct on (ep.player_id) ep.player_id, t.name
  from public.edition_players ep join public.teams t on t.id = ep.team_id join public.editions e on e.id = ep.edition_id
  order by ep.player_id, e.year desc
) sub
where sub.player_id = p.id and p.team_name is null;

-- ¿La matrícula ya tiene usuario? (login en dos pasos). Llamable sin estar logueado.
create or replace function public.matricula_status(p_matricula text)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from auth.users where email = public.matricula_email(trim(p_matricula)))
    then 'registered' else 'new' end
$$;
revoke all on function public.matricula_status(text) from public;
grant execute on function public.matricula_status(text) to anon, authenticated;

-- Puede escribir: admins y jugadores del plantel de la edición actual. El resto solo mira.
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players p
    where p.id = public.current_player_id()
      and (p.is_admin or exists (
        select 1 from public.edition_players ep join public.editions e on e.id = ep.edition_id
        where ep.player_id = p.id and e.is_current))
  )
$$;
revoke all on function public.can_write() from public, anon;
grant execute on function public.can_write() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['editions','teams','edition_players','courses','course_holes','fixtures','scorecards','hole_scores',
    'matches','match_players','match_results','expenses','expense_shares','settlements','vehicles','vehicle_trips','vehicle_seats','awards','sponsors']
  loop
    execute format('drop policy if exists "write_auth" on public.%I;', t);
    execute format('drop policy if exists "write_can" on public.%I;', t);
    execute format('create policy "write_can" on public.%I for all to authenticated using (public.can_write()) with check (public.can_write());', t);
  end loop;
end $$;

drop policy if exists "write_auth" on public.players;
drop policy if exists "write_can" on public.players;
drop policy if exists "update_self" on public.players;
drop policy if exists "link_google" on public.players;
create policy "write_can" on public.players for all to authenticated using (public.can_write()) with check (public.can_write());
create policy "update_self" on public.players for update to authenticated
  using (id = public.current_player_id()) with check (id = public.current_player_id());
create policy "link_google" on public.players for update to authenticated
  using (auth_user_id is null and email is not null and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (auth_user_id = auth.uid());
