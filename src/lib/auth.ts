import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Dominio de los emails internos (uno por jugador, nunca reciben mails). Igual que public.matricula_email(). */
const MATRICULA_DOMAIN = "@jugador.bogeyinvitational.com.ar";

export const matriculaEmail = (m: string) => `${m.trim()}${MATRICULA_DOMAIN}`;

export function matriculaFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.toLowerCase();
  return e.endsWith(MATRICULA_DOMAIN) ? e.slice(0, -MATRICULA_DOMAIN.length) : null;
}

/** El usuario entró con matrícula + contraseña (no con Google). */
export const isMatriculaUser = (u: User | null | undefined) => matriculaFromEmail(u?.email) != null;

export const mustChangePassword = (u: User | null | undefined) =>
  isMatriculaUser(u) && u?.user_metadata?.must_change_password === true;

export async function signInWithMatricula(matricula: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: matriculaEmail(matricula), password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) throw new Error("Matrícula o contraseña incorrecta");
    if (!navigator.onLine || /fetch|network|load failed/i.test(error.message)) throw new Error("Sin señal. Probá de nuevo en un rato.");
    throw new Error(error.message);
  }
}

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { must_change_password: false },
  });
  if (error) {
    if (/should be different/i.test(error.message)) {
      // Puede pasar si el cambio ya se había guardado y se perdió la respuesta (señal mala): refrescar y seguir.
      const { data } = await supabase.auth.refreshSession();
      if (data.user && data.user.user_metadata?.must_change_password !== true) return;
      throw new Error("La contraseña nueva tiene que ser distinta a la actual");
    }
    if (/at least/i.test(error.message)) throw new Error("La contraseña es muy corta");
    throw error;
  }
}

/** Admin: asigna la matrícula (crea el login) o resetea la contraseña a la matrícula. */
export async function adminSetPlayerLogin(playerId: string, matricula: string, reset = false): Promise<void> {
  const { error } = await supabase.rpc("admin_set_player_login", {
    p_player_id: playerId,
    p_matricula: matricula.trim(),
    p_reset: reset,
  });
  if (error) throw error;
}
