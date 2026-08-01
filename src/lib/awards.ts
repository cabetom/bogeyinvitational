import { supabase } from "./supabase";

const ICONS: Record<string, string> = {
  teams: "🏆", copa: "🏆",
  stableford: "🧥", chaqueta: "🧥",
  mvp: "👑",
  longest: "🚀", approach: "🎯",
  sponsor: "🎁",
  fun: "🃏",
  otros: "🏅",
};
export const AWARD_CATS = [
  { key: "chaqueta", label: "🧥 Chaqueta / Stableford" },
  { key: "copa", label: "🏆 Copa por equipos" },
  { key: "mvp", label: "👑 MVP" },
  { key: "longest", label: "🚀 Longest Drive" },
  { key: "approach", label: "🎯 Approach a bandera" },
  { key: "sponsor", label: "🎁 Premio de sponsor" },
  { key: "fun", label: "🃏 Mención especial" },
  { key: "otros", label: "🏅 Otro" },
];
export function awardIcon(cat: string | null): string {
  return (cat && ICONS[cat]) || "🏅";
}

export interface AwardRow {
  id: string;
  edition_id: string;
  category: string | null;
  title: string | null;
  prize: string | null;
  sponsor: string | null;
  note: string | null;
  player_id: string | null;
  team_id: string | null;
  playerName: string | null;
}

export async function getAwards(editionId: string): Promise<AwardRow[]> {
  const { data, error } = await supabase
    .from("awards")
    .select("id, edition_id, category, title, prize, sponsor, note, player_id, team_id, players(full_name)")
    .eq("edition_id", editionId);
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, playerName: a.players?.full_name ?? null }));
}

export async function getAllAwards(): Promise<AwardRow[]> {
  const { data, error } = await supabase
    .from("awards")
    .select("id, edition_id, category, title, prize, sponsor, note, player_id, team_id, players(full_name)")
    .order("edition_id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, playerName: a.players?.full_name ?? null }));
}

export async function addAward(editionId: string, input: {
  title: string; category: string; playerId: string | null; teamId: string | null; prize: string | null; sponsor: string | null;
}): Promise<void> {
  const { error } = await supabase.from("awards").insert({
    edition_id: editionId, title: input.title.trim(), category: input.category,
    player_id: input.playerId, team_id: input.teamId,
    prize: input.prize?.trim() || null, sponsor: input.sponsor?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteAward(id: string): Promise<void> {
  const { error } = await supabase.from("awards").delete().eq("id", id);
  if (error) throw error;
}
