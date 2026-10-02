export type TeamName = "Pato" | "Tano";
export type Modality = "fourball" | "individual";

export interface Edition {
  id: string;
  year: number;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  total_points: number | null;
  /** Tarjetas que se descartan en el ranking stableford (la(s) de menor puntaje). */
  stableford_drop?: number;
}

export interface Player {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  auth_user_id: string | null;
  matricula: string | null;
  /** Equipo de siempre (para quienes no juegan esta edición). */
  team_name?: "Pato" | "Tano" | null;
  /** Índice de hándicap de we.golf. */
  handicap_index?: number | null;
  handicap_club?: string | null;
  handicap_updated_at?: string | null;
  self_registered?: boolean;
}

export interface Team {
  id: string;
  edition_id: string;
  name: string;
  captain_player_id: string | null;
  color: string | null;
}

export interface EditionPlayer {
  edition_id: string;
  player_id: string;
  team_id: string | null;
  handicap: number | null;
}

export interface Course {
  id: string;
  name: string;
  location_url: string | null;
  par_total: number;
  holes: number;
}

export interface Fixture {
  id: string;
  edition_id: string;
  day_no: number;
  date: string | null;
  course_id: string | null;
  modality: Modality;
  tee_time?: string | null; // "09:30:00"
}

export interface Scorecard {
  id: string;
  fixture_id: string;
  player_id: string;
  stableford: number | null;
  entry_mode: "total" | "hole_by_hole";
  photo_url: string | null;
}

export interface MatchResult {
  match_id: string;
  winner_side: "A" | "B" | "H" | null;
  winner_team_id: string | null;
  margin: string | null;
}

/** Fila del ranking stableford (derivada en el cliente). */
export interface RankRow {
  player: Player;
  team: Team | null;
  points: number;
  rounds: number;
  /** Stableford por fecha (fixture_id -> puntos). */
  byFixture: Record<string, number | null>;
  /** Posición compartida en caso de empate (1, 2, 2, 4…). */
  pos: number;
  /** Hándicap del torneo (edition_players.handicap). */
  handicap?: number | null;
  /** Suma de todas las tarjetas, sin descartar. */
  total: number;
  /** Fechas descartadas (no suman en points). */
  dropped: string[];
}

/** Récord de matches de un jugador (para MVP e historial). */
export interface MatchRecord {
  player: Player;
  wins: number;
  losses: number;
  halved: number;
}
