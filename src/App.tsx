import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth/AuthProvider";
import { AppDataProvider, useAppData } from "./data/AppData";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { notify } from "./lib/notify";
import { installAvailable, isIOS, isStandalone, onInstallChange, promptInstall } from "./lib/pwa";
import { Login } from "./screens/Login";
import { Home } from "./screens/Home";
import { Ranking } from "./screens/Ranking";
import { Equipos } from "./screens/Equipos";
import { Cargar } from "./screens/Cargar";
import { Mas } from "./screens/Mas";
import { Perfil } from "./screens/Perfil";
import { Premios, Viaje } from "./screens/Secciones";
import { Presupuesto } from "./screens/Presupuesto";
import { Camionetas } from "./screens/Camionetas";
import { Admin } from "./screens/Admin";
import { EnVivo } from "./screens/EnVivo";
import { Spinner, displayName } from "./ui/misc";

export type Screen =
  | "inicio" | "ranking" | "cargar" | "equipos" | "more"
  | "premios" | "viaje" | "vans" | "presu" | "perfil" | "admin" | "live";

const TOP: Record<Screen, Screen> = {
  inicio: "inicio", ranking: "ranking", cargar: "cargar", equipos: "equipos", more: "more",
  premios: "more", viaje: "more", vans: "more", presu: "more", perfil: "more", admin: "more", live: "equipos",
};

const NavCtx = createContext<(s: Screen) => void>(() => {});
export const useNav = () => useContext(NavCtx);

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark"
  );
  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("bogey-theme", next);
    } catch {
      /* ignore */
    }
    setDark(!dark);
  }
  return (
    <button className="theme-btn" onClick={toggle} aria-label={dark ? "Modo día" : "Modo noche"} title={dark ? "Modo día" : "Modo noche"}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

function TickerBanner() {
  const { teams, teamScore, ranking, edition } = useAppData();
  const pato = teams.find((t) => t.name === "Pato");
  const tano = teams.find((t) => t.name === "Tano");
  const p = pato ? teamScore[pato.id] ?? 0 : 0;
  const t = tano ? teamScore[tano.id] ?? 0 : 0;

  const items: string[] = [];
  items.push(`⛳  PATO  ${p} – ${t}  TANO`);
  items.push(p === t ? "Van empatados" : `Lidera el ${p > t ? "Pato" : "Tano"}`);
  ranking.slice(0, 5).forEach((r, i) => {
    items.push(`${i === 0 ? "🧥 " : `${i + 1}. `}${displayName(r.player.full_name)} · ${r.points}`);
  });
  if (edition) items.push(`Edición ${edition.year}`);
  if (items.length < 3) return null;

  const loop = [...items, ...items];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {loop.map((it, i) => <span className="it" key={i}>{it}</span>)}
      </div>
    </div>
  );
}

function InstallBanner() {
  const [avail, setAvail] = useState(installAvailable());
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("bogey-install") === "dismissed"; } catch { return false; }
  });
  useEffect(() => onInstallChange(() => setAvail(installAvailable())), []);

  if (isStandalone() || dismissed) return null;
  const ios = isIOS();
  if (!avail && !ios) return null; // nada para ofrecer (desktop / navegador sin soporte)

  function close() {
    setDismissed(true);
    try { localStorage.setItem("bogey-install", "dismissed"); } catch { /* ignore */ }
  }

  return (
    <div className="install-banner">
      <img src="/icons/icon-192.png" alt="" className="ib-icon" />
      <div className="ib-txt">
        <b>Instalá la app</b>
        <span>{ios ? "Tocá Compartir ⬆ y elegí “Agregar a inicio”" : "Accedé más rápido desde tu pantalla"}</span>
      </div>
      {avail && <button className="ib-btn" onClick={() => promptInstall()}>Instalar</button>}
      <button className="ib-x" onClick={close} aria-label="Cerrar">✕</button>
    </div>
  );
}

function Shell() {
  const [screen, setScreen] = useState<Screen>("inicio");
  const { editions, selectedEditionId, setEditionId, teams, teamScore, reload } = useAppData();

  // Realtime: cualquier cambio en un partido refresca el marcador de toda la app + notifica.
  useEffect(() => {
    const ch = supabase
      .channel("rt-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results" }, (payload) => {
        reload();
        const row = payload.new as { status?: string } | null;
        if (row?.status === "final") notify("Bogey Invitational", "Se cerró un partido ⛳ — mirá cómo va la Copa");
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  const patoId = teams.find((t) => t.name === "Pato")?.id;
  const tanoId = teams.find((t) => t.name === "Tano")?.id;
  const edScore =
    patoId && tanoId ? `${teamScore[patoId] ?? 0}–${teamScore[tanoId] ?? 0}` : "–";

  const body: Record<Screen, ReactNode> = {
    inicio: <Home />, ranking: <Ranking />, equipos: <Equipos />, cargar: <Cargar />,
    more: <Mas />, premios: <Premios />, viaje: <Viaje />, vans: <Camionetas />,
    presu: <Presupuesto />, perfil: <Perfil />, admin: <Admin />, live: <EnVivo />,
  };

  const top = TOP[screen];

  return (
    <NavCtx.Provider value={setScreen}>
      <div className="app">
        <header className="appbar">
          <i className="logo l-word wordmark" role="img" aria-label="Bogey Invitational" />
          <ThemeToggle />
          <div className="ed">
            <b>{edScore}</b>
            <select
              className="year-select"
              value={selectedEditionId ?? ""}
              onChange={(e) => setEditionId(e.target.value)}
              aria-label="Elegir edición"
            >
              {editions.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  Edición {ed.year}
                </option>
              ))}
            </select>
          </div>
        </header>

        <TickerBanner />
        <InstallBanner />

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
