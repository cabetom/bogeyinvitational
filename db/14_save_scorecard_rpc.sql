-- 14: guardado atómico de tarjetas (tarjeta + hoyos en una transacción) + updated_at. Ya aplicado.
alter table public.scorecards add column if not exists updated_at timestamptz default now();
update public.scorecards set updated_at = coalesce(updated_at, created_at, now());

create or replace function public.save_scorecard(
  p_fixture_id text, p_player_id text, p_handicap numeric, p_stableford integer,
  p_entry_mode text, p_submitted_by text, p_holes jsonb default '[]'::jsonb
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare v_id text; v_ts timestamptz := now();
begin
  insert into public.scorecards (fixture_id, player_id, handicap, stableford, entry_mode, submitted_by, updated_at)
  values (p_fixture_id, p_player_id, p_handicap, p_stableford, p_entry_mode, p_submitted_by, v_ts)
  on conflict (fixture_id, player_id) do update
    set handicap = excluded.handicap, stableford = excluded.stableford, entry_mode = excluded.entry_mode,
        submitted_by = excluded.submitted_by, updated_at = excluded.updated_at
  returning id into v_id;

  delete from public.hole_scores where scorecard_id = v_id;
  if p_entry_mode = 'hole_by_hole' then
    insert into public.hole_scores (scorecard_id, hole_no, strokes)
    select v_id, (h->>'hole_no')::int, (h->>'strokes')::int
    from jsonb_array_elements(coalesce(p_holes, '[]'::jsonb)) h
    where (h->>'strokes')::int > 0;
  end if;
  return v_ts;
end $$;

revoke all on function public.save_scorecard(text, text, numeric, integer, text, text, jsonb) from public, anon;
grant execute on function public.save_scorecard(text, text, numeric, integer, text, text, jsonb) to authenticated;
