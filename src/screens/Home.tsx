import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { SponsorsBlock } from "./Secciones";
import { Spinner } from "../ui/misc";

export function Home() {
  const { loading, error, edition, teams, teamScore, ranking, records } = useAppData();
  const { player } = useAuth();
  const nav = useNav();

  if (loading) return <Spinner />;
  if (error) return <div className="center-msg">No se pudieron cargar los datos.<br />{error}</div>;

  const pato = teams.find((t) => t.name === "Pato");
  const tano = teams.find((t) => t.name === "Tano");
  const pScore = pato ? teamScore[pato.id] ?? 0 : 0;
  const tScore = tano ? teamScore[tano.id] ?? 0 : 0;
  const leader = pScore === tScore ? null : pScore > tScore ? "Pato" : "Tano";

  const myIndex = player ? ranking.findIndex((r) => r.player.id === player.id) : -1;
  const myRow = myIndex >= 0 ? ranking[myIndex] : null;
  const myRec = player ? records.find((r) => r.player.id === player.id) : null;

  return (
    <>
      <div className="scorebug">
        <i className="logo l-mascot wm" aria-hidden="true" />
        <div className="lbl">Copa por equipos · {edition?.name ?? ""}</div>
        <div className="row">
          <div className="team"><div className="nm"><span className="dot pato" />Pato</div><div className="sc">{pScore}</div></div>
          <div className="vs">matches</div>
          <div className="team"><div className="nm">Tano<span className="dot tano" /></div><div className="sc">{tScore}</div></div>
        </div>
        <div className="lead-note">
          {leader ? <>Lidera <b>Equipo {leader}</b></> : <>Van <b>empatados</b></>}
        </div>
      </div>

      <button className="live-cta" onClick={() => nav("live")}>
        <span className="rd" />
        <div><div className="t">Partidos en vivo</div><div className="s">Seguí los fourball hoyo a hoyo</div></div>
        <span className="go">›</span>
      </button>

      {myRow && (
        <>
          <div className="sec-title"><h2>Vos, hasta acá</h2><button className="link" onClick={() => nav("perfil")}>Mi perfil →</button></div>
          <div className="grid2">
            <div className="stat"><div className="n tabular">{myRow.points}</div><div className="k">Pts. Stableford</div></div>
            <div className="stat"><div className="n tabular">{myIndex + 1}º</div><div className="k">en el ranking</div></div>
            <div className="stat"><div className="n tabular">{myRec ? `${myRec.wins}–${myRec.losses}` : "–"}</div><div className="k">Tus matches G–P</div></div>
            <div className="stat"><div className="n tabular">{myRow.rounds}</div><div className="k">Vueltas cargadas</div></div>
          </div>
        </>
      )}

      <div className="sec-title"><h2>Accesos</h2></div>
      <div className="grid2">
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => nav("cargar")}>
          <div className="n">＋</div><div className="k">Cargar mi tarjeta</div>
        </button>
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => nav("equipos")}>
          <div className="n">⛳</div><div className="k">Ver matches</div>
        </button>
      </div>

      <SponsorsBlock />
    </>
  );
}
