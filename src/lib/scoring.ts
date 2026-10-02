/**
 * Cálculo de stableford NETO y resolución de fourball match play.
 * Se usa cuando se carga hoyo por hoyo (entry_mode = 'hole_by_hole').
 */

export interface HoleInfo {
  hole_no: number;
  par: number;
  stroke_index: number; // 1..18
}

/** Hándicap de juego entero (12.4 -> 12, 12.5 -> 13). */
export function playingHandicap(h: number): number {
  return Math.round(h);
}

/** Golpes de hándicap que recibe un jugador en un hoyo dado (negativo = hándicap "plus", devuelve golpes). */
export function strokesReceived(handicap: number, strokeIndex: number): number {
  const ph = playingHandicap(handicap);
  if (ph < 0) {
    // plus: devuelve golpes empezando por los hoyos más fáciles (SI 18, 17, …)
    const give = -ph;
    return -(Math.floor(give / 18) + (strokeIndex > 18 - (give % 18) ? 1 : 0));
  }
  const base = Math.floor(ph / 18);
  const extra = ph % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

/** Puntos stableford de un hoyo a partir de los golpes brutos. */
export function holeStablefordPoints(
  grossStrokes: number,
  hole: HoleInfo,
  playingHandicap: number
): number {
  const net = grossStrokes - strokesReceived(playingHandicap, hole.stroke_index);
  return Math.max(0, hole.par - net + 2);
}

/** Stableford neto total de una vuelta (18 hoyos). */
export function roundStableford(
  grossByHole: Record<number, number>,
  holes: HoleInfo[],
  playingHandicap: number
): number {
  return holes.reduce((sum, h) => {
    const g = grossByHole[h.hole_no];
    if (g == null) return sum;
    return sum + holeStablefordPoints(g, h, playingHandicap);
  }, 0);
}

export interface FourballResult {
  winner: "A" | "B" | "H";
  holesUp: number;
  holesPlayed: number;
  margin: string; // '3&2', 'AS', '2 up'...
}

/**
 * Resuelve un fourball match play a mejor bola NETA por hoyo.
 * sideA / sideB: para cada jugador, sus golpes brutos por hoyo y su handicap.
 */
export function resolveFourball(
  sideA: { grossByHole: Record<number, number>; handicap: number }[],
  sideB: { grossByHole: Record<number, number>; handicap: number }[],
  holes: HoleInfo[]
): FourballResult {
  let up = 0; // >0 gana A, <0 gana B
  let played = 0;

  const bestNet = (
    players: { grossByHole: Record<number, number>; handicap: number }[],
    h: HoleInfo
  ): number | null => {
    let best: number | null = null;
    for (const p of players) {
      const g = p.grossByHole[h.hole_no];
      if (g == null) continue;
      const net = g - strokesReceived(p.handicap, h.stroke_index);
      if (best == null || net < best) best = net;
    }
    return best;
  };

  for (const h of holes) {
    const a = bestNet(sideA, h);
    const b = bestNet(sideB, h);
    if (a == null || b == null) continue;
    played++;
    if (a < b) up++;
    else if (b < a) up--;
  }

  const remaining = holes.length - played;
  const lead = Math.abs(up);
  let winner: "A" | "B" | "H" = "H";
  if (up > 0) winner = "A";
  else if (up < 0) winner = "B";

  let margin = "AS";
  if (winner !== "H") {
    margin = remaining > 0 && lead > remaining ? `${lead}&${remaining}` : `${lead} up`;
  }
  return { winner, holesUp: up, holesPlayed: played, margin };
}

/** Hándicap escrito a mano: "12,5" -> 12.5 · "+2" (plus) -> -2 · "" -> null. Mismo criterio en Cargar y en Gestión. */
export function parseHcp(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "" || t === "-" || t === "+") return null;
  const n = Number(t.startsWith("+") ? `-${t.slice(1)}` : t);
  return Number.isFinite(n) ? n : null;
}

/** Hándicap para mostrar: -2 -> "+2" · 12.5 -> "12.5" */
export function fmtHcp(h: number | null | undefined): string {
  if (h == null) return "";
  return h < 0 ? `+${-h}` : String(h);
}

/**
 * Descarte del ranking: de las tarjetas jugadas cuentan las mejores (totalFechas - descarte).
 * Con 4 fechas y 1 descarte: mientras alguien tenga 3 o menos, cuentan todas; con 4, se tira la peor.
 * Devuelve los puntos que cuentan y qué fechas quedaron descartadas.
 */
export function applyDrop(cards: { fixtureId: string; pts: number }[], totalFixtures: number, drop: number): { counted: number; dropped: string[] } {
  const keep = Math.max(0, totalFixtures - drop);
  const sorted = [...cards].sort((a, b) => b.pts - a.pts); // si hay empate en la peor, el total da igual
  if (drop <= 0 || sorted.length <= keep) return { counted: sorted.reduce((s, c) => s + c.pts, 0), dropped: [] };
  return {
    counted: sorted.slice(0, keep).reduce((s, c) => s + c.pts, 0),
    dropped: sorted.slice(keep).map((c) => c.fixtureId),
  };
}
