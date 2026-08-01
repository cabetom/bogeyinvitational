import { supabase } from "./supabase";

/** Agrega un jugador al torneo (autoriza su login por email). Reusa el jugador si el email ya existe. */
export async function addPlayerToEdition(
  editionId: string,
  fullName: string,
  email: string | null,
  teamId: string | null
): Promise<void> {
  let playerId: string | null = null;

  if (email) {
    const { data } = await supabase.from("players").select("id").ilike("email", email).maybeSingle();
    if (data) playerId = (data as { id: string }).id;
  }
  if (!playerId) {
    playerId = crypto.randomUUID();
    const { error } = await supabase
      .from("players")
      .insert({ id: playerId, full_name: fullName, email: email || null });
    if (error) throw error;
  } else {
    // actualizar nombre por si cambió
    await supabase.from("players").update({ full_name: fullName }).eq("id", playerId);
  }

  const { error } = await supabase
    .from("edition_players")
    .upsert({ edition_id: editionId, player_id: playerId, team_id: teamId }, { onConflict: "edition_id,player_id" });
  if (error) throw error;
}

/** Saca un jugador del torneo de esta edición (no borra su historial). */
export async function removeFromEdition(editionId: string, playerId: string): Promise<void> {
  const { error } = await supabase
    .from("edition_players")
    .delete()
    .eq("edition_id", editionId)
    .eq("player_id", playerId);
  if (error) throw error;
}

export async function setPlayerAdmin(playerId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.from("players").update({ is_admin: isAdmin }).eq("id", playerId);
  if (error) throw error;
}
