import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  getCurrentEdition,
  getRanking,
  getTeams,
  getTeamScore,
  getMatchRecords,
} from "../lib/queries";
import type { Edition, RankRow, Team, MatchRecord } from "../lib/types";

interface AppData {
  loading: boolean;
  error: string | null;
  edition: Edition | null;
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
  const [edition, setEdition] = useState<Edition | null>(null);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamScore, setTeamScore] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<MatchRecord[]>([]);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ed = await getCurrentEdition();
        if (!alive) return;
        setEdition(ed);
        if (ed) {
          const [rk, tm, ts, rc] = await Promise.all([
            getRanking(ed.id),
            getTeams(ed.id),
            getTeamScore(ed.id),
            getMatchRecords(ed.id),
          ]);
          if (!alive) return;
          setRanking(rk);
          setTeams(tm);
          setTeamScore(ts);
          setRecords(rc);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error cargando datos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nonce]);

  return (
    <Ctx.Provider value={{ loading, error, edition, ranking, teams, teamScore, records, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppData(): AppData {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppData debe usarse dentro de <AppDataProvider>");
  return c;
}

export function teamByName(teams: Team[], name: string): Team | undefined {
  return teams.find((t) => t.name === name);
}
