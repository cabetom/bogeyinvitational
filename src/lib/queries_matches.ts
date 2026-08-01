import { supabase } from "./supabase";
import type { Course, Fixture } from "./types";

export interface DayMatch {
  id: string;
  modality: string;
  sideA: string[]; // full_name[]
  sideB: string[];
  winner: "A" | "B" | "H" | null;
}
export interface DayResults {
  fixture: Fixture;
  courseName: string | null;
  matches: DayMatch[];
}

export async function getFixtures(editionId: string): Promise<(Fixture & { courseName: string | null })[]> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("*, courses(name)")
    .eq("edition_id", editionId)
    .order("day_no");
  if (error) throw error;
  return (data ?? []).map((f: any) => ({ ...f, courseName: f.courses?.name ?? null }));
}

export async function getCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from("courses").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function getDayResults(editionId: string): Promise<DayResults[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, modality, fixture_id, " +
        "fixtures!inner(id, edition_id, day_no, date, course_id, modality, courses(name)), " +
        "match_players(side, players(full_name)), " +
        "match_results(winner_side)"
    )
    .eq("fixtures.edition_id", editionId);
  if (error) throw error;

  const byFixture = new Map<string, DayResults>();
  for (const m of (data ?? []) as any[]) {
    const fx = m.fixtures;
    if (!byFixture.has(fx.id)) {
      byFixture.set(fx.id, {
        fixture: {
          id: fx.id, edition_id: fx.edition_id, day_no: fx.day_no,
          date: fx.date, course_id: fx.course_id, modality: fx.modality,
        },
        courseName: fx.courses?.name ?? null,
        matches: [],
      });
    }
    const res = Array.isArray(m.match_results) ? m.match_results[0] : m.match_results;
    const sideA: string[] = [];
    const sideB: string[] = [];
    for (const mp of m.match_players ?? []) {
      (mp.side === "A" ? sideA : sideB).push(mp.players?.full_name ?? "?");
    }
    byFixture.get(fx.id)!.matches.push({
      id: m.id, modality: m.modality, sideA, sideB, winner: res?.winner_side ?? null,
    });
  }
  return [...byFixture.values()].sort((a, b) => a.fixture.day_no - b.fixture.day_no);
}

export interface AwardRow {
  id: string;
  edition_id: string;
  category: string;
  note: string | null;
  playerName: string | null;
}
export async function getAwards(): Promise<AwardRow[]> {
  const { data, error } = await supabase
    .from("awards")
    .select("id, edition_id, category, note, players(full_name)")
    .order("edition_id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, playerName: a.players?.full_name ?? null }));
}

export interface HistoryRow {
  fixtureId: string;
  dayNo: number;
  courseName: string | null;
  modality: string;
  stableford: number | null;
  partners: string[];
  opponents: string[];
  result: "A" | "B" | "H" | null;
  won: boolean | null;
}

export async function getPlayerHistory(playerId: string, editionId: string): Promise<HistoryRow[]> {
  const [cards, days, me] = await Promise.all([
    supabase
      .from("scorecards")
      .select("stableford, fixture_id, fixtures!inner(edition_id)")
      .eq("player_id", playerId)
      .eq("fixtures.edition_id", editionId),
    getDayResults(editionId),
    supabase.from("players").select("full_name").eq("id", playerId).maybeSingle(),
  ]);
  if (cards.error) throw cards.error;
  const myName = (me.data as { full_name: string } | null)?.full_name ?? "";
  const cardByFx = new Map<string, number | null>();
  for (const c of (cards.data ?? []) as any[]) cardByFx.set(c.fixture_id, c.stableford);

  const rows: HistoryRow[] = [];
  for (const d of days) {
    // buscar el match del jugador ese día
    const { data: mine } = await supabase
      .from("match_players")
      .select("side, match_id, matches!inner(fixture_id)")
      .eq("player_id", playerId)
      .eq("matches.fixture_id", d.fixture.id)
      .maybeSingle();
    let partners: string[] = [];
    let opponents: string[] = [];
    let result: "A" | "B" | "H" | null = null;
    let won: boolean | null = null;
    if (mine) {
      const side = (mine as any).side as "A" | "B";
      const m = d.matches.find((mm) => mm.id === (mine as any).match_id);
      if (m) {
        partners = (side === "A" ? m.sideA : m.sideB).filter((n) => n !== myName);
        opponents = side === "A" ? m.sideB : m.sideA;
        result = m.winner;
        won = m.winner === "H" ? null : m.winner === side;
      }
    }
    rows.push({
      fixtureId: d.fixture.id, dayNo: d.fixture.day_no, courseName: d.courseName,
      modality: d.fixture.modality, stableford: cardByFx.get(d.fixture.id) ?? null,
      partners, opponents, result, won,
    });
  }
  return rows.sort((a, b) => b.dayNo - a.dayNo);
}

export async function upsertScorecardTotal(
  fixtureId: string,
  playerId: string,
  stableford: number,
  submittedBy: string,
  handicap: number | null = null
): Promise<void> {
  const { error } = await supabase
    .from("scorecards")
    .upsert(
      { fixture_id: fixtureId, player_id: playerId, stableford, entry_mode: "total", handicap, submitted_by: submittedBy },
      { onConflict: "fixture_id,player_id" }
    );
  if (error) throw error;
}

/** Guarda la vuelta hoyo por hoyo + hándicap; el stableford neto ya viene calculado. */
export async function saveHoleByHole(
  fixtureId: string,
  playerId: string,
  handicap: number,
  grossByHole: Record<number, number>,
  stableford: number,
  submittedBy: string
): Promise<void> {
  const { data, error } = await supabase
    .from("scorecards")
    .upsert(
      { fixture_id: fixtureId, player_id: playerId, stableford, entry_mode: "hole_by_hole", handicap, submitted_by: submittedBy },
      { onConflict: "fixture_id,player_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  const scId = (data as { id: string }).id;
  const rows = Object.entries(grossByHole)
    .filter(([, v]) => v != null && v > 0)
    .map(([h, v]) => ({ scorecard_id: scId, hole_no: Number(h), strokes: v }));
  if (rows.length) {
    const { error: e2 } = await supabase.from("hole_scores").upsert(rows, { onConflict: "scorecard_id,hole_no" });
    if (e2) throw e2;
  }
}
