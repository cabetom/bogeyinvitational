import { supabase } from "./supabase";
import { roundStableford, type HoleInfo } from "./scoring";
import type { Course, Fixture } from "./types";

/** Corta un pedido colgado (señal mala) para poder avisarle al jugador. */
export function withTimeout<T>(p: PromiseLike<T>, ms = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

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
        "fixtures!inner(id, edition_id, day_no, date, course_id, modality, tee_time, courses(name)), " +
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
          date: fx.date, course_id: fx.course_id, modality: fx.modality, tee_time: fx.tee_time ?? null,
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

export interface SavedCard {
  id: string;
  stableford: number | null;
  handicap: number | null;
  entry_mode: string | null;
  submittedByName: string | null;
  gross: Record<number, number>;
  /** ms epoch de la última vez que se guardó (para saber si un borrador local es más nuevo). */
  updatedAt: number;
}

/** Tarjeta ya guardada de un jugador en una fecha (con sus hoyos), o null. */
export async function getScorecard(fixtureId: string, playerId: string): Promise<SavedCard | null> {
  const { data, error } = await supabase
    .from("scorecards")
    .select("id, stableford, handicap, entry_mode, updated_at, submitter:players!scorecards_submitted_by_fkey(full_name), hole_scores(hole_no, strokes)")
    .eq("fixture_id", fixtureId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as any;
  const gross: Record<number, number> = {};
  for (const h of d.hole_scores ?? []) if (h.strokes > 0) gross[h.hole_no] = h.strokes;
  return {
    id: d.id, stableford: d.stableford, handicap: d.handicap != null ? Number(d.handicap) : null,
    entry_mode: d.entry_mode, submittedByName: d.submitter?.full_name ?? null, gross,
    updatedAt: d.updated_at ? Date.parse(d.updated_at) : 0,
  };
}

/** Guarda la tarjeta en UNA transacción (RPC save_scorecard): la tarjeta + exactamente los hoyos cargados.
 *  entry_mode "total" guarda solo el stableford (sin hoyos). */
export async function saveScorecard(input: {
  fixtureId: string; playerId: string; handicap: number | null; stableford: number;
  mode: "hole_by_hole" | "total"; submittedBy: string; gross?: Record<number, number>;
}): Promise<void> {
  const holes = Object.entries(input.gross ?? {})
    .filter(([, v]) => v != null && v > 0)
    .map(([h, v]) => ({ hole_no: Number(h), strokes: v }));
  const { error } = await supabase.rpc("save_scorecard", {
    p_fixture_id: input.fixtureId, p_player_id: input.playerId, p_handicap: input.handicap,
    p_stableford: input.stableford, p_entry_mode: input.mode, p_submitted_by: input.submittedBy,
    p_holes: input.mode === "hole_by_hole" ? holes : [],
  });
  if (error) throw error;
}

/** Recalcula el stableford guardado de las tarjetas hoyo por hoyo (p. ej. después de corregir pares/SI de una cancha). */
export async function recomputeCards(opts: { courseId?: string; editionId?: string; playerId?: string; fixtureId?: string }): Promise<number> {
  let q = supabase
    .from("scorecards")
    .select("id, stableford, handicap, player_id, fixtures!inner(course_id, edition_id), hole_scores(hole_no, strokes)")
    .eq("entry_mode", "hole_by_hole");
  if (opts.courseId) q = q.eq("fixtures.course_id", opts.courseId);
  if (opts.editionId) q = q.eq("fixtures.edition_id", opts.editionId);
  if (opts.playerId) q = q.eq("player_id", opts.playerId);
  if (opts.fixtureId) q = q.eq("fixture_id", opts.fixtureId);
  const { data, error } = await q;
  if (error) throw error;
  const holesByCourse = new Map<string, HoleInfo[]>();
  let changed = 0;
  for (const c of (data ?? []) as any[]) {
    const courseId = c.fixtures?.course_id;
    if (!courseId || c.handicap == null) continue;
    if (!holesByCourse.has(courseId)) {
      const h = await supabase.from("course_holes").select("hole_no, par, stroke_index").eq("course_id", courseId);
      if (h.error) throw h.error;
      holesByCourse.set(courseId, (h.data ?? []) as HoleInfo[]);
    }
    const holes = holesByCourse.get(courseId)!;
    if (holes.length !== 18) continue;
    const gross: Record<number, number> = {};
    for (const hs of c.hole_scores ?? []) if (hs.strokes > 0) gross[hs.hole_no] = hs.strokes;
    const pts = roundStableford(gross, holes, Number(c.handicap));
    if (pts !== c.stableford) {
      const u = await supabase.from("scorecards").update({ stableford: pts }).eq("id", c.id);
      if (u.error) throw u.error;
      changed++;
    }
  }
  return changed;
}
