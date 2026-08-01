import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  getEditions,
  getRanking,
  getTeams,
  getTeamScore,
  getMatchRecords,
} from "../lib/queries";
import type { Edition, RankRow, Team, MatchRecord } from "../lib/types";

interface AppData {
  loading: boolean;
  error: string | null;
  editions: Edition[];
  edition: Edition | null;
  selectedEditionId: string | null;
  setEditionId: (id: string) => void;
  ranking: RankRow[];
  teams: Team[];
  teamScore: Record<string, number>;
  records: MatchRecord[];
  reload: () => void;
}

const Ctx = createContext<AppData | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamScore, setTeamScore] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<MatchRecord[]>([]);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Cargar la lista de ediciones una vez y elegir la actual por defecto.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const eds = await getEditions();
        if (!alive) return;
        setEditions(eds);
        setSelectedEditionId((prev) => prev ?? eds.find((e) => e.is_current)?.id ?? eds[0]?.id ?? null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error cargando ediciones");
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Cargar los datos de la edición seleccionada.
  useEffect(() => {
    if (!selectedEditionId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [rk, tm, ts, rc] = await Promise.all([
          getRanking(selectedEditionId),
          getTeams(selectedEditionId),
          getTeamScore(selectedEditionId),
          getMatchRecords(selectedEditionId),
        ]);
        if (!alive) return;
        setRanking(rk);
        setTeams(tm);
        setTeamScore(ts);
        setRecords(rc);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error cargando datos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedEditionId, nonce]);

  const edition = editions.find((e) => e.id === selectedEditionId) ?? null;

  return (
    <Ctx.Provider
      value={{
        loading, error, editions, edition, selectedEditionId,
        setEditionId: setSelectedEditionId, ranking, teams, teamScore, records, reload,
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
