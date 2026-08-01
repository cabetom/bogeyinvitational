import { supabase } from "./supabase";

/** Sube la foto de perfil al bucket 'avatars' y actualiza players.avatar_url. Devuelve la URL pública. */
export async function uploadAvatar(playerId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${playerId}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
  const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
  if (up.error) throw up.error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl;
  const { error } = await supabase.from("players").update({ avatar_url: url }).eq("id", playerId);
  if (error) throw error;
  return url;
}
