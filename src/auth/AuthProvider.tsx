import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getMyPlayer } from "../lib/queries";
import type { Player } from "../lib/types";

interface AuthState {
  session: Session | null;
  player: Player | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadPlayer(s: Session | null) {
    if (!s?.user) {
      setPlayer(null);
      return;
    }
    try {
      const p = await getMyPlayer(s.user.id, s.user.email ?? null);
      setPlayer(p);
    } catch {
      setPlayer(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadPlayer(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadPlayer(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    player,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
      setPlayer(null);
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
