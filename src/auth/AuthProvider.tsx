import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getMyPlayer } from "../lib/queries";
import { withTimeout } from "../lib/queries_matches";
import type { Player } from "../lib/types";

/** ok = jugador encontrado · none = el usuario no tiene jugador · error = no se pudo consultar (sin señal). */
export type PlayerStatus = "loading" | "ok" | "none" | "error";

interface AuthState {
  session: Session | null;
  player: Player | null;
  playerStatus: PlayerStatus;
  loading: boolean;
  /** Hay sesión guardada en el celu pero no se pudo validar por falta de señal (no mostrar el Login). */
  offline: boolean;
  signOut: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("loading");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Evita que una respuesta vieja (de otro usuario o de un pedido anterior) pise el estado.
  const reqRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const statusRef = useRef<PlayerStatus>("loading");
  const retryRef = useRef<number | null>(null);

  const setStatus = (s: PlayerStatus) => { statusRef.current = s; setPlayerStatus(s); };

  const loadPlayer = useCallback(async (s: Session | null) => {
    if (retryRef.current) { window.clearTimeout(retryRef.current); retryRef.current = null; }
    const req = ++reqRef.current;
    if (!s?.user) {
      userIdRef.current = null;
      setPlayer(null);
      setStatus("none");
      return;
    }
    const uid = s.user.id;
    if (userIdRef.current !== uid) {
      // cambió el usuario: no mostrar el jugador anterior
      userIdRef.current = uid;
      setPlayer(null);
      setStatus("loading");
    }
    try {
      const p = await withTimeout(getMyPlayer(uid, s.user.email ?? null), 12000);
      if (req !== reqRef.current || userIdRef.current !== uid) return;
      setPlayer(p);
      setStatus(p ? "ok" : "none");
    } catch {
      if (req !== reqRef.current || userIdRef.current !== uid) return;
      // Sin señal: conservar el último jugador conocido y reintentar.
      if (statusRef.current !== "ok") setStatus("error");
      retryRef.current = window.setTimeout(() => loadPlayer(s), 5000);
    }
  }, []);

  useEffect(() => {
    let offlineTimer: number | null = null;
    // ¿Hay una sesión guardada en el celu? (si el token venció y no hay señal, getSession devuelve null)
    const hasStoredSession = () => {
      try { return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")); } catch { return false; }
    };
    const init = () => {
      if (offlineTimer) { window.clearTimeout(offlineTimer); offlineTimer = null; }
      return supabase.auth
        .getSession()
        .then(async ({ data, error }) => {
          if (!data.session && error && hasStoredSession()) {
            setOffline(true);
            offlineTimer = window.setTimeout(init, 8000);
            return;
          }
          setOffline(false);
          setSession(data.session);
          await loadPlayer(data.session);
        })
        .catch(() => { if (hasStoredSession()) { setOffline(true); offlineTimer = window.setTimeout(init, 8000); } else setStatus("error"); })
        .finally(() => setLoading(false));
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Sin señal con la sesión guardada: no mandar al Login (SIGNED_OUT solo llega si de verdad se cerró la sesión).
      if (!s && event !== "SIGNED_OUT" && hasStoredSession()) { setOffline(true); return; }
      setOffline(false);
      setSession(s);
      // auth-js emite SIGNED_IN / TOKEN_REFRESHED cada vez que la app vuelve a primer plano:
      // si es el mismo usuario y ya tenemos su jugador, no hace falta volver a buscarlo.
      if (s?.user && s.user.id === userIdRef.current && statusRef.current === "ok" && event !== "USER_UPDATED") return;
      loadPlayer(s);
    });
    const onOnline = () => { init(); };
    window.addEventListener("online", onOnline);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      if (retryRef.current) window.clearTimeout(retryRef.current);
      if (offlineTimer) window.clearTimeout(offlineTimer);
    };
  }, [loadPlayer]);

  const value: AuthState = {
    session,
    player,
    playerStatus,
    loading,
    offline,
    signOut: async () => {
      reqRef.current++;
      userIdRef.current = null;
      setPlayer(null);
      setStatus("none");
      // scope local: cerrar sesión en este celu no desloguea los otros dispositivos
      await supabase.auth.signOut({ scope: "local" });
    },
    refreshPlayer: () => loadPlayer(session),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return c;
}
