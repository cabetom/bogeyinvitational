import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { getDayResults, type DayResults } from "../lib/queries_matches";
import { getRyderStandings, type RyderStandings } from "../lib/queries";
import { displayName, shortName, Spinner } from "../ui/misc";

function RyderBoard({ s }: { s: RyderStandings }) {
  const { patoPts, tanoPts, totalMatches, played, pointsToWin } = s;
  if (totalMatches === 0) {
    return <div className="center-msg" style={{ padding: "22px 20px" }}>Todavía no hay partidos cargados para esta edición.</div>;
  }
  const patoW = (patoPts / totalMatches) * 100;
  const tanoW = (tanoPts / totalMatches) * 100;
  const needP = Math.max(0, pointsToWin - patoPts);
  const needT = Math.max(0, pointsToWin - tanoPts);
  const patoWon = needP === 0;
  const tanoWon = needT === 0;
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

  const status = (won: boolean, need: number) =>
    won ? "¡Copa asegurada! 🏆" : `necesita ${fmt(need)} pto${need === 1 ? "" : "s"}`;

  return (
    <div className="ryder">
      <div className="ryder-head">
        <div className="rt pato"><span className="dot pato" /> Pato</div>
        <div className="rmid">
          <b className="tabular">{fmt(patoPts)}</b><span>–</span><b className="tabular">{fmt(tanoPts)}</b>
        </div>
        <div className="rt tano">Tano <span className="dot tano" /></div>
      </div>
      <div className="ryder-bar">
        <div className="rp" style={{ width: `${patoW}%` }} />
        <div className="rt-fill" style={{ width: `${tanoW}%` }} />
        <div className="rwin" style={{ left: "50%" }} title="Línea para ganar la Copa" />
      </div>
      <div className="ryder-legend">
        <span className={patoWon ? "won" : ""}>{status(patoWon, needP)}</span>
        <span className="mid">Se gana con {fmt(pointsToWin)} de {totalMatches}</span>
        <span className={tanoWon ? "won" : ""}>{status(tanoWon, needT)}</span>
      </div>
      <div className="ryder-sub">{played} de {totalMatches} partidos jugados · {totalMatches - played} por jugar</div>
    </div>
  );
}

export function Equipos() {
  const { edition, teams, teamScore, records, loading } = useAppData();
  const [days, setDays] = useState<DayResults[] | null>(null);
  const [ryder, setRyder] = useState<RyderStandings | null>(null);

  useEffect(() => {
    if (!edition) return;
    setDays(null); setRyder(null);
    getDayResults(edition.id).then(setDays).catch(() => setDays([]));
    getRyderStandings(edition.id).then(setRyder).catch(() => setRyder(null));
  }, [edition]);

  if (loading) return <Spinner />;

  const pato = teams.find((t) => t.name === "Pato");
  const tano = teams.find((t) => t.name === "Tano");
  const mvp = records[0];

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Copa · Ryder</h2></div>
      {ryder ? <RyderBoard s={ryder} /> : <Spinner />}

      <div className="teamsplit" style={{ marginTop: 14 }}>
        <div className="teamcard pato">
          <div className="cap">Capitán · el Pato</div><div className="nm">Pato</div>
          <div className="big">{pato ? teamScore[pato.id] ?? 0 : 0}</div>
        </div>
        <div className="teamcard tano">
          <div className="cap">Capitán · el Tano</div><div className="nm">Tano</div>
          <div className="big">{tano ? teamScore[tano.id] ?? 0 : 0}</div>
        </div>
      </div>

      {mvp && mvp.wins + mvp.losses > 0 && (
        <>
          <div className="sec-title"><h2>MVP del torneo</h2></div>
          <div className="mvp">
            <div className="crown">👑</div>
            <div className="who"><div className="nm">{displayName(mvp.player.full_name)}</div><div className="s">Mejor récord de matches</div></div>
            <div className="rec"><b>{mvp.wins}–{mvp.losses}</b><span>Matches</span></div>
          </div>
        </>
      )}

      <div className="sec-title"><h2>Resultados por día</h2></div>
      {days && days.length === 0 && <div className="muted" style={{ padding: "0 4px" }}>Sin partidos cargados todavía.</div>}
      {!days ? <Spinner /> : days.map((d) => {
        const a = d.matches.filter((m) => m.winner === "A").length;
        const b = d.matches.filter((m) => m.winner === "B").length;
        return (
          <div key={d.fixture.id}>
            <div className="dayhdr">
              <span className="dn">Día {d.fixture.day_no}</span>
              <span className="dc">{d.courseName ?? ""}{d.fixture.modality === "individual" ? " · Individual" : ""}</span>
              <span className="dscore">{a} – {b}</span>
            </div>
            <div className="card">
              {d.matches.map((m) => (
                <div key={m.id} className="match">
                  <div className="pl a">{m.sideA.map((n, i) => <div key={i} className={m.winner === "A" ? "n" : ""}>{shortName(n)}</div>)}</div>
                  <div className={`res ${m.winner === "A" ? "pato" : m.winner === "B" ? "tano" : "h"}`}>
                    {m.winner === "A" ? "Pato" : m.winner === "B" ? "Tano" : "—"}
                  </div>
                  <div className="pl b">{m.sideB.map((n, i) => <div key={i} className={m.winner === "B" ? "n" : ""}>{shortName(n)}</div>)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
