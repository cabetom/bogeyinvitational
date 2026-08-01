import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "./auth/AuthProvider";
import { AppDataProvider, useAppData } from "./data/AppData";
import { isSupabaseConfigured } from "./lib/supabase";
import { Login } from "./screens/Login";
import { Home } from "./screens/Home";
import { Ranking } from "./screens/Ranking";
import { Equipos } from "./screens/Equipos";
import { Cargar } from "./screens/Cargar";
import { Mas } from "./screens/Mas";
import { Perfil } from "./screens/Perfil";
import { Premios, Viaje, Camionetas, Presupuesto } from "./screens/Secciones";
import { Spinner } from "./ui/misc";

export type Screen =
  | "inicio" | "ranking" | "cargar" | "equipos" | "more"
  | "premios" | "viaje" | "vans" | "presu" | "perfil";

const TOP: Record<Screen, Screen> = {
  inicio: "inicio", ranking: "ranking", cargar: "cargar", equipos: "equipos", more: "more",
  premios: "more", viaje: "more", vans: "more", presu: "more", perfil: "more",
};

const NavCtx = createContext<(s: Screen) => void>(() => {});
export const useNav = () => useContext(NavCtx);

function Shell() {
  const [screen, setScreen] = useState<Screen>("inicio");
  const { edition, teams, teamScore } = useAppData();

  const patoId = teams.find((t) => t.name === "Pato")?.id;
  const tanoId = teams.find((t) => t.name === "Tano")?.id;
  const edScore =
    patoId && tanoId ? `${teamScore[patoId] ?? 0}–${teamScore[tanoId] ?? 0}` : "–";

  const body: Record<Screen, ReactNode> = {
    inicio: <Home />, ranking: <Ranking />, equipos: <Equipos />, cargar: <Cargar />,
    more: <Mas />, premios: <Premios />, viaje: <Viaje />, vans: <Camionetas />,
    presu: <Presupuesto />, perfil: <Perfil />,
  };

  const top = TOP[screen];

  return (
    <NavCtx.Provider value={setScreen}>
      <div className="app">
        <header className="appbar">
          <i className="logo l-word wordmark" role="img" aria-label="Bogey Invitational" />
          <div className="ed">
            <b>{edScore}</b>
            <span>Pato vs Tano{edition ? ` · ${edition.year}` : ""}</span>
          </div>
        </header>

        <main className="scroll">
          <div className="screen" key={screen}>{body[screen]}</div>
        </main>

        <nav className="nav">
          <button className={top === "inicio" ? "active" : ""} onClick={() => setScreen("inicio")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
            <span className="lb">Inicio</span>
          </button>
          <button className={top === "ranking" ? "active" : ""} onClick={() => setScreen("ranking")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 20V10M12 20V4M18 20v-6" /></svg>
            <span className="lb">Ranking</span>
          </button>
          <button className="load" onClick={() => setScreen("cargar")}>
            <span className="ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg></span>
            <span className="lb">Cargar</span>
          </button>
          <button className={top === "equipos" ? "active" : ""} onClick={() => setScreen("equipos")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>
            <span className="lb">Equipos</span>
          </button>
          <button className={top === "more" ? "active" : ""} onClick={() => setScreen("more")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            <span className="lb">Más</span>
          </button>
        </nav>
      </div>
    </NavCtx.Provider>
  );
}

export function App() {
  const { loading, session } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <div className="login">
        <h1>Falta configurar Supabase</h1>
        <p>Creá un archivo <b>.env.local</b> con <b>VITE_SUPABASE_URL</b> y <b>VITE_SUPABASE_ANON_KEY</b> y reiniciá el servidor.</p>
      </div>
    );
  }
  if (loading) return <div className="app"><Spinner /></div>;
  if (!session) return <Login />;

  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
