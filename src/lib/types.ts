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
}

export interface Player {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  auth_user_id: string | null;
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
}

/** Récord de matches de un jugador (para MVP e historial). */
export interface MatchRecord {
  player: Player;
  wins: number;
  losses: number;
  halved: number;
}
