import { supabase } from "./supabase";
import type {
  Edition,
  Player,
  Team,
  EditionPlayer,
  RankRow,
  MatchRecord,
} from "./types";

export async function getCurrentEdition(): Promise<Edition | null> {
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Edition | null;
}

export async function getEditions(): Promise<Edition[]> {
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .order("year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Edition[];
}

export async function getTeams(editionId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("edition_id", editionId);
  if (error) throw error;
  return (data ?? []) as Team[];
}

interface RosterRow extends EditionPlayer {
  players: Player;
}

export async function getRoster(editionId: string): Promise<RosterRow[]> {
  const { data, error } = await supabase
    .from("edition_players")
    .select("edition_id, player_id, team_id, handicap, players(*)")
    .eq("edition_id", editionId);
  if (error) throw error;
  return (data ?? []) as unknown as RosterRow[];
}

/** Ranking stableford acumulado de la edición (suma de tarjetas). */
export async function getRanking(editionId: string): Promise<RankRow[]> {
  const [roster, teams, cards] = await Promise.all([
    getRoster(editionId),
    getTeams(editionId),
    supabase
      .from("scorecards")
      .select("stableford, player_id, fixtures!inner(edition_id)")
      .eq("fixtures.edition_id", editionId),
  ]);
  if (cards.error) throw cards.error;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const agg = new Map<string, { points: number; rounds: number }>();
  for (const c of (cards.data ?? []) as { stableford: number | null; player_id: string }[]) {
    const cur = agg.get(c.player_id) ?? { points: 0, rounds: 0 };
    cur.points += c.stableford ?? 0;
    cur.rounds += c.stableford != null ? 1 : 0;
    agg.set(c.player_id, cur);
  }

  const rows: RankRow[] = roster.map((r) => {
    const a = agg.get(r.player_id) ?? { points: 0, rounds: 0 };
    return {
      player: r.players,
      team: r.team_id ? teamById.get(r.team_id) ?? null : null,
      points: a.points,
      rounds: a.rounds,
    };
  });
  rows.sort((x, y) => y.points - x.points);
  return rows;
}

/** Cantidad de matches ganados por equipo. */
export async function getTeamScore(editionId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("match_results")
    .select("winner_team_id, matches!inner(fixtures!inner(edition_id))")
    .eq("matches.fixtures.edition_id", editionId);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { winner_team_id: string | null }[]) {
    if (!r.winner_team_id) continue;
    out[r.winner_team_id] = (out[r.winner_team_id] ?? 0) + 1;
  }
  return out;
}

/** Récord de matches por jugador (para MVP y perfil). */
export async function getMatchRecords(editionId: string): Promise<MatchRecord[]> {
  const [roster, mp] = await Promise.all([
    getRoster(editionId),
    supabase
      .from("match_players")
      .select("player_id, side, matches!inner(id, fixtures!inner(edition_id), match_results(winner_side))")
      .eq("matches.fixtures.edition_id", editionId),
  ]);
  if (mp.error) throw mp.error;

  const rec = new Map<string, MatchRecord>();
  for (const r of roster) {
    rec.set(r.player_id, { player: r.players, wins: 0, losses: 0, halved: 0 });
  }
  type Row = {
    player_id: string;
    side: "A" | "B";
    matches: { match_results: { winner_side: string | null }[] | { winner_side: string | null } | null };
  };
  for (const r of (mp.data ?? []) as unknown as Row[]) {
    const res = Array.isArray(r.matches?.match_results)
      ? r.matches.match_results[0]
      : r.matches?.match_results;
    const w = res?.winner_side;
    const entry = rec.get(r.player_id);
    if (!entry || !w) continue;
    if (w === "H") entry.halved++;
    else if (w === r.side) entry.wins++;
    else entry.losses++;
  }
  const out = [...rec.values()];
  out.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  return out;
}

export async function getMyPlayer(authUserId: string, email: string | null): Promise<Player | null> {
  // Primero por auth_user_id; si no, por email (y lo linkeamos).
  let { data } = await supabase.from("players").select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (data) return data as Player;
  if (email) {
    const byEmail = await supabase
      .from("players")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (byEmail.data) {
      await supabase.from("players").update({ auth_user_id: authUserId }).eq("id", (byEmail.data as Player).id);
      return byEmail.data as Player;
    }
  }
  return null;
}
