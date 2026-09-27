import { supabase } from "./supabase";
import { matriculaFromEmail } from "./auth";
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
      .select("stableford, player_id, fixture_id, fixtures!inner(edition_id)")
      .eq("fixtures.edition_id", editionId),
  ]);
  if (cards.error) throw cards.error;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const agg = new Map<string, { points: number; rounds: number; byFixture: Record<string, number | null> }>();
  for (const c of (cards.data ?? []) as { stableford: number | null; player_id: string; fixture_id: string }[]) {
    const cur = agg.get(c.player_id) ?? { points: 0, rounds: 0, byFixture: {} };
    cur.points += c.stableford ?? 0;
    cur.rounds += c.stableford != null ? 1 : 0;
    cur.byFixture[c.fixture_id] = c.stableford;
    agg.set(c.player_id, cur);
  }

  const rows: RankRow[] = roster.map((r) => {
    const a = agg.get(r.player_id) ?? { points: 0, rounds: 0, byFixture: {} };
    return {
      player: r.players,
      team: r.team_id ? teamById.get(r.team_id) ?? null : null,
      points: a.points,
      rounds: a.rounds,
      byFixture: a.byFixture,
      pos: 0,
    };
  });
  rows.sort((x, y) => y.points - x.points || x.player.full_name.localeCompare(y.player.full_name));
  // empates comparten posición (1, 2, 2, 4…)
  rows.forEach((row, i) => { row.pos = i > 0 && rows[i - 1].points === row.points ? rows[i - 1].pos : i + 1; });
  return rows;
}

/** Puntos por equipo de los partidos cerrados (ganado = 1, empate = 0.5 cada uno). */
export async function getTeamScore(editionId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("match_results")
    .select("winner_side, winner_team_id, matches!inner(team_a_id, team_b_id, fixtures!inner(edition_id))")
    .eq("matches.fixtures.edition_id", editionId);
  if (error) throw error;
  const out: Record<string, number> = {};
  const add = (id: string | null | undefined, n: number) => { if (id) out[id] = (out[id] ?? 0) + n; };
  type Row = { winner_side: string | null; winner_team_id: string | null; matches: { team_a_id: string | null; team_b_id: string | null } };
  for (const r of (data ?? []) as unknown as Row[]) {
    if (r.winner_side === "H") { add(r.matches?.team_a_id, 0.5); add(r.matches?.team_b_id, 0.5); }
    else if (r.winner_side) add(r.winner_team_id, 1);
  }
  return out;
}

export interface RyderStandings {
  pato: Team | null;
  tano: Team | null;
  patoPts: number;
  tanoPts: number;
  totalMatches: number;
  played: number;
  live: number;
  toWin: number;          // puntos para GANAR la copa (challenger)
  toRetain: number;       // puntos para RETENER (campeón defensor, medio punto menos)
  champion: "Pato" | "Tano" | null; // campeón defensor (ganó la edición anterior)
}

/** Standings estilo Ryder Cup: puntos por equipo (empate = 0.5) + cuánto falta para ganar/retener. */
export async function getRyderStandings(editionId: string): Promise<RyderStandings> {
  const [teams, results, count, eds] = await Promise.all([
    getTeams(editionId),
    supabase
      .from("match_results")
      .select("winner_side, winner_team_id, status, matches!inner(fixtures!inner(edition_id))")
      .eq("matches.fixtures.edition_id", editionId),
    supabase
      .from("matches")
      .select("id, fixtures!inner(edition_id)", { count: "exact", head: true })
      .eq("fixtures.edition_id", editionId),
    getEditions(),
  ]);
  if (results.error) throw results.error;

  const pato = teams.find((t) => t.name === "Pato") ?? null;
  const tano = teams.find((t) => t.name === "Tano") ?? null;
  let patoPts = 0, tanoPts = 0, played = 0, live = 0;
  for (const r of (results.data ?? []) as { winner_side: string | null; winner_team_id: string | null; status: string | null }[]) {
    if (r.status === "en_juego") live++;
    if (!r.winner_side) continue; // solo cuentan los finales
    played++;
    if (r.winner_side === "H") { patoPts += 0.5; tanoPts += 0.5; }
    else if (r.winner_team_id === pato?.id) patoPts += 1;
    else if (r.winner_team_id === tano?.id) tanoPts += 1;
  }
  const cur = eds.find((e) => e.id === editionId);
  const planned = cur?.total_points ?? 0;
  const totalMatches = Math.max(count.count ?? 0, played, planned);
  // Como la Ryder: con 10 puntos, el retador necesita 5½ y al campeón le alcanza con 5.
  const toWin = totalMatches > 0 ? totalMatches / 2 + 0.5 : 0;
  const toRetain = totalMatches > 0 ? totalMatches / 2 : 0;

  // Campeón defensor = ganador de la edición anterior
  let champion: "Pato" | "Tano" | null = null;
  const prev = cur ? eds.filter((e) => e.year < cur.year).sort((a, b) => b.year - a.year)[0] : undefined;
  if (prev) {
    const { data } = await supabase
      .from("awards")
      .select("team_id, note")
      .eq("edition_id", prev.id)
      .eq("category", "teams")
      .maybeSingle();
    const hay = `${(data as any)?.note ?? ""} ${(data as any)?.team_id ?? ""}`.toLowerCase();
    if (hay.includes("tano")) champion = "Tano";
    else if (hay.includes("pato")) champion = "Pato";
  }

  return { pato, tano, patoPts, tanoPts, totalMatches, played, live, toWin, toRetain, champion };
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
  out.sort((a, b) => (b.wins + b.halved / 2) - (a.wins + a.halved / 2) || a.losses - b.losses);
  return out;
}

/** Jugador del usuario logueado. null = no hay jugador; tira error si falla la red (no confundir con "no vinculado"). */
export async function getMyPlayer(authUserId: string, email: string | null): Promise<Player | null> {
  // Login por matrícula: el email interno identifica al jugador (no se pisa el auth_user_id de Google).
  const matricula = matriculaFromEmail(email);
  if (matricula) {
    const { data, error } = await supabase.from("players").select("*").eq("matricula", matricula).maybeSingle();
    if (error) throw error;
    return (data as Player) ?? null;
  }
  // Google: primero por auth_user_id; si no, por email (y lo linkeamos).
  const { data, error } = await supabase.from("players").select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw error;
  if (data) return data as Player;
  if (email) {
    const byEmail = await supabase
      .from("players")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (byEmail.error) throw byEmail.error;
    if (byEmail.data) {
      await supabase.from("players").update({ auth_user_id: authUserId }).eq("id", (byEmail.data as Player).id);
      return byEmail.data as Player;
    }
  }
  return null;
}
