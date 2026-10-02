-- 18: resultado de los partidos hoyo a hoyo (quién ganó cada hoyo) + recálculo automático del match_result. Ya aplicado.
create table if not exists public.match_holes (
  match_id text not null references public.matches(id) on delete cascade,
  hole_no integer not null check (hole_no between 1 and 18),
  winner char(1) not null check (winner in ('A','B','H')),
  updated_by text references public.players(id),
  updated_at timestamptz not null default now(),
  primary key (match_id, hole_no)
);
alter table public.match_holes enable row level security;
drop policy if exists "read_auth" on public.match_holes;
drop policy if exists "write_can" on public.match_holes;
create policy "read_auth" on public.match_holes for select to authenticated using (true);
create policy "write_can" on public.match_holes for all to authenticated using (public.can_write()) with check (public.can_write());

-- Carga (o borra, con p_winner null) el ganador de un hoyo y recalcula el resultado del partido.
-- Un solo match_result por partido, calculado por el sistema: arriba/abajo, hoyos jugados, y cierre
-- automático cuando queda definido (ventaja > hoyos que faltan) o al completar los 18.
create or replace function public.set_match_hole(p_match_id text, p_hole integer, p_winner text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_a int; v_b int; v_n int; v_up int; v_rem int;
  v_team_a text; v_team_b text;
  v_status text; v_win char(1); v_win_team text; v_margin text;
begin
  if p_hole < 1 or p_hole > 18 then raise exception 'Hoyo inválido'; end if;
  if p_winner is null then
    delete from public.match_holes where match_id = p_match_id and hole_no = p_hole;
  else
    if p_winner not in ('A','B','H') then raise exception 'Ganador inválido'; end if;
    insert into public.match_holes (match_id, hole_no, winner, updated_by, updated_at)
    values (p_match_id, p_hole, p_winner, public.current_player_id(), now())
    on conflict (match_id, hole_no) do update
      set winner = excluded.winner, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;

  select count(*) filter (where winner = 'A'), count(*) filter (where winner = 'B'), count(*)
    into v_a, v_b, v_n from public.match_holes where match_id = p_match_id;
  select team_a_id, team_b_id into v_team_a, v_team_b from public.matches where id = p_match_id;

  v_up := v_a - v_b;            -- + Pato (A) arriba, - Tano (B)
  v_rem := 18 - v_n;
  if v_n = 0 then
    v_status := 'pendiente'; v_win := null; v_win_team := null; v_margin := null;
  elsif abs(v_up) > v_rem or v_n = 18 then
    v_status := 'final';
    v_win := case when v_up > 0 then 'A' when v_up < 0 then 'B' else 'H' end;
    v_win_team := case when v_up > 0 then v_team_a when v_up < 0 then v_team_b else null end;
    v_margin := case when v_up = 0 then 'AS' when v_rem > 0 then abs(v_up) || '&' || v_rem else abs(v_up) || ' up' end;
  else
    v_status := 'en_juego'; v_win := null; v_win_team := null; v_margin := null;
  end if;

  insert into public.match_results (match_id, status, up, thru, winner_side, winner_team_id, margin, decided_by)
  values (p_match_id, v_status, v_up, nullif(v_n, 0), v_win, v_win_team, v_margin, 'hoyo_a_hoyo')
  on conflict (match_id) do update
    set status = excluded.status, up = excluded.up, thru = excluded.thru, winner_side = excluded.winner_side,
        winner_team_id = excluded.winner_team_id, margin = excluded.margin, decided_by = excluded.decided_by;
end $$;
revoke all on function public.set_match_hole(text, integer, text) from public, anon;
grant execute on function public.set_match_hole(text, integer, text) to authenticated;
