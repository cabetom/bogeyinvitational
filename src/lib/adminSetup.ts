import { supabase } from "./supabase";
import type { Course, Modality } from "./types";

export interface HoleRow {
  hole_no: number;
  par: number;
  stroke_index: number;
}

export async function getCourseHoles(courseId: string): Promise<HoleRow[]> {
  const { data, error } = await supabase
    .from("course_holes")
    .select("hole_no, par, stroke_index")
    .eq("course_id", courseId)
    .order("hole_no");
  if (error) throw error;
  return (data ?? []) as HoleRow[];
}

export async function saveCourseHoles(courseId: string, holes: HoleRow[]): Promise<void> {
  const rows = holes.map((h) => ({ course_id: courseId, hole_no: h.hole_no, par: h.par, stroke_index: h.stroke_index }));
  const { error } = await supabase.from("course_holes").upsert(rows, { onConflict: "course_id,hole_no" });
  if (error) throw error;
  // actualizar par_total
  const par = holes.reduce((s, h) => s + (h.par || 0), 0);
  await supabase.from("courses").update({ par_total: par }).eq("id", courseId);
}

export async function addCourse(code: string, name: string, url: string | null): Promise<Course> {
  const id = code.trim().toUpperCase().slice(0, 6) || crypto.randomUUID().slice(0, 5).toUpperCase();
  const { data, error } = await supabase
    .from("courses")
    .insert({ id, name: name.trim(), location_url: url || null, par_total: 72 })
    .select("*")
    .single();
  if (error) throw error;
  return data as Course;
}

export async function addFixture(
  editionId: string,
  dayNo: number,
  date: string | null,
  courseId: string | null,
  modality: Modality,
  teeTime: string | null = null
): Promise<void> {
  const id = `${editionId}-d${dayNo}-${crypto.randomUUID().slice(0, 4)}`;
  const { error } = await supabase
    .from("fixtures")
    .insert({ id, edition_id: editionId, day_no: dayNo, date, course_id: courseId, modality, tee_time: teeTime });
  if (error) throw error;
}

export async function updateFixture(id: string, patch: { date?: string | null; course_id?: string | null; modality?: Modality; tee_time?: string | null }): Promise<void> {
  const { error } = await supabase.from("fixtures").update(patch).eq("id", id);
  if (error) throw error;
}

/** Cuántas tarjetas y partidos se perderían al borrar una fecha. */
export async function fixtureDependents(id: string): Promise<{ cards: number; matches: number }> {
  const [c, m] = await Promise.all([
    supabase.from("scorecards").select("id", { count: "exact", head: true }).eq("fixture_id", id),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("fixture_id", id),
  ]);
  if (c.error) throw c.error;
  if (m.error) throw m.error;
  return { cards: c.count ?? 0, matches: m.count ?? 0 };
}

/** Valida los 18 hoyos: pares 3-6 y hándicap (SI) del 1 al 18 sin repetir. Devuelve el error o null. */
export function validateHoles(holes: HoleRow[]): string | null {
  if (holes.length !== 18) return "Tienen que ser 18 hoyos.";
  const bad = holes.find((h) => !(h.par >= 3 && h.par <= 6));
  if (bad) return `El hoyo ${bad.hole_no} tiene un par inválido.`;
  const si = holes.map((h) => h.stroke_index);
  const missing = Array.from({ length: 18 }, (_, i) => i + 1).filter((n) => !si.includes(n));
  if (missing.length) return `El hándicap de los hoyos tiene que usar del 1 al 18 sin repetir. Falta: ${missing.join(", ")}.`;
  return null;
}

export async function deleteFixture(id: string): Promise<void> {
  const { error } = await supabase.from("fixtures").delete().eq("id", id);
  if (error) throw error;
}

/** Cuántas tarjetas (las de menor puntaje) se descartan en el ranking stableford. */
export async function setEditionDrop(editionId: string, drop: number): Promise<void> {
  const { error } = await supabase.from("editions").update({ stableford_drop: drop }).eq("id", editionId);
  if (error) throw error;
}

/** Define los puntos totales en juego (Ryder) de una edición. */
export async function setEditionTotalPoints(editionId: string, total: number | null): Promise<void> {
  const { error } = await supabase.from("editions").update({ total_points: total }).eq("id", editionId);
  if (error) throw error;
}

/** Crea una edición nueva (año) y la marca como actual si se pide. */
export async function addEdition(year: number, makeCurrent: boolean): Promise<void> {
  const id = `ed-${year}`;
  if (makeCurrent) await supabase.from("editions").update({ is_current: false }).neq("id", id);
  const { error } = await supabase.from("editions").upsert({
    id, year, name: `Bogey Invitational ${year}`, location: "Córdoba, Argentina", is_current: makeCurrent,
  });
  if (error) throw error;
}
