import { supabase } from "./supabase";

export interface LivePlayer { id: string; full_name: string }
export interface LiveMatch {
  id: string;
  sideA: LivePlayer[]; // Pato
  sideB: LivePlayer[]; // Tano
  status: "pendiente" | "en_juego" | "final";
  up: number | null;   // + = Pato adelante, - = Tano
  thru: number | null;
  winner: "A" | "B" | "H" | null;
  margin: string | null;
  modality: string;
  /** Equipos del propio partido (el punto va a estos, no a los de la edición que se esté mirando). */
  teamAId: string | null;
  teamBId: string | null;
  /** Ganador de cada hoyo cargado (hoyo -> "A" Pato | "B" Tano | "H" empate). */
  holes: Record<number, HoleWinner>;
}

export type HoleWinner = "A" | "B" | "H";

/** Carga (o borra, con null) el ganador de un hoyo; el servidor recalcula el partido y lo cierra solo si queda definido. */
export async function setMatchHole(matchId: string, hole: number, winner: HoleWinner | null): Promise<void> {
  const { error } = await supabase.rpc("set_match_hole", { p_match_id: matchId, p_hole: hole, p_winner: winner });
  if (error) throw error;
}

/** Estado del partido a partir de los hoyos (misma regla que set_match_hole en la base). */
export function holesState(holes: Record<number, HoleWinner>) {
  const vals = Object.values(holes);
  const played = vals.length;
  const up = vals.filter((w) => w === "A").length - vals.filter((w) => w === "B").length;
  const remaining = 18 - played;
  const decided = played > 0 && (Math.abs(up) > remaining || played === 18);
  const winner: HoleWinner | null = decided ? (up > 0 ? "A" : up < 0 ? "B" : "H") : null;
  return { played, up, remaining, decided, winner, margin: decided ? matchMargin(up, played) : null };
}

export async function createMatch(
  fixtureId: string, teamAId: string, teamBId: string, patoIds: string[], tanoIds: string[],
  modality: "fourball" | "individual" = "fourball"
): Promise<void> {
  const all = [...patoIds, ...tanoIds];
  if (new Set(all).size !== all.length) throw new Error("Hay un jugador repetido");
  // Un jugador no puede estar en dos partidos del mismo día.
  const busy = await supabase
    .from("match_players")
    .select("player_id, matches!inner(fixture_id)")
    .eq("matches.fixture_id", fixtureId)
    .in("player_id", all);
  if (busy.error) throw busy.error;
  if ((busy.data ?? []).length) throw new Error("Alguno de esos jugadores ya tiene partido ese día");

  const id = `m-${crypto.randomUUID().slice(0, 8)}`;
  const m = await supabase.from("matches").insert({ id, fixture_id: fixtureId, modality, team_a_id: teamAId, team_b_id: teamBId });
  if (m.error) throw m.error;
  const players = [
    ...patoIds.map((pid) => ({ match_id: id, player_id: pid, side: "A" })),
    ...tanoIds.map((pid) => ({ match_id: id, player_id: pid, side: "B" })),
  ];
  const mp = await supabase.from("match_players").insert(players);
  const mr = mp.error ? null : await supabase.from("match_results").upsert({ match_id: id, status: "pendiente" }, { onConflict: "match_id" });
  if (mp.error || mr?.error) {
    await supabase.from("matches").delete().eq("id", id); // no dejar partidos a medio crear
    throw mp.error ?? mr!.error;
  }
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) throw error;
}

export async function getMatchesForFixture(fixtureId: string): Promise<LiveMatch[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, modality, team_a_id, team_b_id, match_players(side, players(id, full_name)), match_results(status, up, thru, winner_side, margin), match_holes(hole_no, winner)")
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  return (data ?? []).map((m: any) => {
    const res = Array.isArray(m.match_results) ? m.match_results[0] : m.match_results;
    const sideA: LivePlayer[] = [], sideB: LivePlayer[] = [];
    for (const mp of m.match_players ?? []) {
      const p = { id: mp.players?.id, full_name: mp.players?.full_name ?? "?" };
      (mp.side === "A" ? sideA : sideB).push(p);
    }
    return {
      id: m.id, sideA, sideB,
      status: res?.status ?? "pendiente",
      up: res?.up ?? null, thru: res?.thru ?? null,
      winner: res?.winner_side ?? null,
      margin: res?.margin ?? null,
      modality: m.modality ?? "fourball",
      teamAId: m.team_a_id ?? null,
      teamBId: m.team_b_id ?? null,
      holes: Object.fromEntries((m.match_holes ?? []).map((h: any) => [h.hole_no, h.winner])),
    } as LiveMatch;
  });
}

/** Guarda resultado parcial (en juego). up: + Pato adelante, - Tano. */
export async function saveLive(matchId: string, up: number, thru: number | null): Promise<void> {
  const { error } = await supabase
    .from("match_results")
    .upsert({ match_id: matchId, status: "en_juego", up, thru, winner_side: null, winner_team_id: null }, { onConflict: "match_id" });
  if (error) throw error;
}

/** "3&2" si se definió antes del 18, "2 up" si llegó al 18, "AS" si empató. */
export function matchMargin(up: number, thru: number | null): string {
  if (up === 0) return "AS";
  const lead = Math.abs(up);
  const remaining = thru != null && thru > 0 && thru < 18 ? 18 - thru : 0;
  return remaining > 0 && lead > remaining ? `${lead}&${remaining}` : `${lead} up`;
}

/** Cierra el partido (final). Calcula ganador según up. */
export async function finishMatch(matchId: string, up: number, teamAId: string, teamBId: string, thru: number | null): Promise<void> {
  const winner_side = up > 0 ? "A" : up < 0 ? "B" : "H";
  const winner_team_id = up > 0 ? teamAId : up < 0 ? teamBId : null;
  const margin = matchMargin(up, thru);
  const { error } = await supabase
    .from("match_results")
    .upsert({ match_id: matchId, status: "final", up, thru, winner_side, winner_team_id, margin }, { onConflict: "match_id" });
  if (error) throw error;
}
