import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  getEditions,
  getRanking,
  getTeams,
  getTeamScore,
  getMatchRecords,
} from "../lib/queries";
import { withTimeout } from "../lib/queries_matches";
import type { Edition, RankRow, Team, MatchRecord } from "../lib/types";

interface AppData {
  /** true solo mientras no hay ningún dato de la edición elegida (no en cada actualización). */
  loading: boolean;
  error: string | null;
  editions: Edition[];
  /** Edición que se está mirando (selector del header). */
  edition: Edition | null;
  /** Edición en curso (is_current): ahí se cargan tarjetas y partidos. */
  currentEdition: Edition | null;
  /** La edición que se mira es la actual. */
  isCurrent: boolean;
  selectedEditionId: string | null;
  setEditionId: (id: string) => void;
  ranking: RankRow[];
  teams: Team[];
  teamScore: Record<string, number>;
  records: MatchRecord[];
  /** Cambia cada vez que se recargan los datos: las pantallas lo usan para refrescar lo suyo. */
  version: number;
  reload: () => void;
}

const Ctx = createContext<AppData | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamScore, setTeamScore] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<MatchRecord[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [version, setVersion] = useState(0);
  const retryRef = useRef<number | null>(null);
  const failsRef = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Volver a la app o recuperar la señal => refrescar.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", reload);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", reload); };
  }, [reload]);

  useEffect(() => {
    let alive = true;
    if (retryRef.current) { window.clearTimeout(retryRef.current); retryRef.current = null; }
    (async () => {
      try {
        const eds = await withTimeout(getEditions(), 15000);
        if (!alive) return;
        setEditions(eds);
        const edId = selectedEditionId ?? eds.find((e) => e.is_current)?.id ?? eds[0]?.id ?? null;
        if (!selectedEditionId && edId) { setSelectedEditionId(edId); return; } // el efecto vuelve a correr
        if (!edId) return;
        const [rk, tm, ts, rc] = await withTimeout(Promise.all([
          getRanking(edId),
          getTeams(edId),
          getTeamScore(edId),
          getMatchRecords(edId),
        ]), 20000);
        if (!alive) return;
        setRanking(rk);
        setTeams(tm);
        setTeamScore(ts);
        setRecords(rc);
        setLoadedFor(edId);
        setError(null);
        failsRef.current = 0;
        setVersion((v) => v + 1);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error cargando datos");
        // Reintento con espera creciente (sin señal en la cancha).
        const wait = Math.min(30000, 3000 * 2 ** failsRef.current++);
        retryRef.current = window.setTimeout(reload, wait);
      }
    })();
    return () => { alive = false; };
  }, [selectedEditionId, nonce, reload]);

  const edition = editions.find((e) => e.id === selectedEditionId) ?? null;
  const currentEdition = editions.find((e) => e.is_current) ?? null;
  const loading = (loadedFor === null || loadedFor !== selectedEditionId) && !error;

  return (
    <Ctx.Provider
      value={{
        loading,
        error: loadedFor === selectedEditionId ? null : error,
        editions, edition, currentEdition,
        isCurrent: !!edition && edition.id === currentEdition?.id,
        selectedEditionId,
        setEditionId: (id: string) => { setError(null); setSelectedEditionId(id); }, ranking, teams, teamScore, records, version, reload,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppData(): AppData {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppData debe usarse dentro de <AppDataProvider>");
  return c;
}
