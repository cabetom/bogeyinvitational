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
}

export async function createMatch(
  fixtureId: string, teamAId: string, teamBId: string, patoIds: string[], tanoIds: string[]
): Promise<void> {
  const id = `m-${crypto.randomUUID().slice(0, 8)}`;
  const m = await supabase.from("matches").insert({ id, fixture_id: fixtureId, modality: "fourball", team_a_id: teamAId, team_b_id: teamBId });
  if (m.error) throw m.error;
  const players = [
    ...patoIds.map((pid) => ({ match_id: id, player_id: pid, side: "A" })),
    ...tanoIds.map((pid) => ({ match_id: id, player_id: pid, side: "B" })),
  ];
  const mp = await supabase.from("match_players").insert(players);
  if (mp.error) throw mp.error;
  await supabase.from("match_results").upsert({ match_id: id, status: "pendiente" }, { onConflict: "match_id" });
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) throw error;
}

export async function getMatchesForFixture(fixtureId: string): Promise<LiveMatch[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, match_players(side, players(id, full_name)), match_results(status, up, thru, winner_side)")
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

/** Cierra el partido (final). Calcula ganador según up. */
export async function finishMatch(matchId: string, up: number, teamAId: string, teamBId: string, thru: number | null): Promise<void> {
  const winner_side = up > 0 ? "A" : up < 0 ? "B" : "H";
  const winner_team_id = up > 0 ? teamAId : up < 0 ? teamBId : null;
  const margin = up === 0 ? "AS" : `${Math.abs(up)} up`;
  const { error } = await supabase
    .from("match_results")
    .upsert({ match_id: matchId, status: "final", up, thru, winner_side, winner_team_id, margin }, { onConflict: "match_id" });
  if (error) throw error;
}
