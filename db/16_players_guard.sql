-- 16: quien solo mira puede cambiar su foto y vincular su Gmail, nada más; solo un admin cambia permisos de admin. Ya aplicado.
-- + hándicaps de we.golf del plantel 2026 (27/09/2026).
create or replace function public.players_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_admin boolean;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if; -- SQL directo / Edge Functions

  select coalesce(p.is_admin, false) into v_admin from public.players p where p.id = public.current_player_id();
  if new.is_admin is distinct from old.is_admin and not coalesce(v_admin, false) then
    raise exception 'Solo un admin puede cambiar permisos de admin';
  end if;

  if not public.can_write() then
    if (new.full_name, new.nickname, new.email, new.matricula, new.team_name, new.handicap_index, new.handicap_club, new.handicap_updated_at, new.self_registered)
       is distinct from
       (old.full_name, old.nickname, old.email, old.matricula, old.team_name, old.handicap_index, old.handicap_club, old.handicap_updated_at, old.self_registered) then
      raise exception 'Sin permiso para modificar este jugador';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id
       and not (old.auth_user_id is null and new.auth_user_id = auth.uid()) then
      raise exception 'Sin permiso para modificar este jugador';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists players_guard on public.players;
create trigger players_guard before update on public.players
  for each row execute function public.players_guard();

-- Hándicaps de we.golf (índice) y como hándicap del torneo 2026
update public.players p set handicap_index = v.idx, handicap_club = v.club, handicap_updated_at = now()
from (values ('102587',6.1,'Tandil Golf Club'),('99413',-1.5,'El Valle De Tandil Golf Club'),('177412',4.1,'El Valle De Tandil Golf Club'),
  ('105744',12,'El Valle De Tandil Golf Club'),('185812',18.4,'Tandil Golf Club'),('92884',5.5,'El Valle De Tandil Golf Club'),
  ('125467',0.3,'El Valle De Tandil Golf Club'),('125984',0.8,'AAG'),('93266',7.3,'Tandil Golf Club')) v(m, idx, club)
where p.matricula = v.m;
update public.edition_players ep set handicap = p.handicap_index
from public.players p where p.id = ep.player_id and ep.edition_id = 'ed-2026' and ep.handicap is null and p.handicap_index is not null;
