import type { Player, Team } from "../lib/types";

/** "do Cobo, Tomás" -> "TD" · "Trueba, Manuel" -> "MT" */
export function initials(fullName: string): string {
  const parts = fullName.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    const last = parts[0];
    const first = parts[1];
    return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
  }
  const words = fullName.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** "do Cobo, Tomás" -> "Tomás do Cobo" */
export function displayName(fullName: string): string {
  const parts = fullName.split(",").map((s) => s.trim());
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
  return fullName;
}

/** "do Cobo, Tomás" -> "T. do Cobo" */
export function shortName(fullName: string): string {
  const parts = fullName.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    const last = parts[0];
    const first = parts[1];
    return `${first[0] ?? ""}. ${last}`;
  }
  return fullName;
}

export function teamColor(team: Team | null | undefined): string {
  if (team?.color) return team.color;
  return "var(--pine)";
}

export function Avatar({
  player,
  team,
  size = 32,
}: {
  player: Pick<Player, "full_name" | "avatar_url">;
  team?: Team | null;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: size * 0.36, background: teamColor(team) };
  return (
    <span className="ava" style={style}>
      {player.avatar_url ? <img src={player.avatar_url} alt="" /> : initials(player.full_name)}
    </span>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Cargando" />;
}
