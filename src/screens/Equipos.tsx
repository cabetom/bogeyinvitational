import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { getDayResults, type DayResults } from "../lib/queries_matches";
import { displayName, shortName, Spinner } from "../ui/misc";

export function Equipos() {
  const { edition, teams, teamScore, records, loading } = useAppData();
  const [days, setDays] = useState<DayResults[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!edition) return;
    getDayResults(edition.id).then(setDays).catch((e) => setErr(String(e)));
  }, [edition]);

  if (loading) return <Spinner />;

  const pato = teams.find((t) => t.name === "Pato");
  const tano = teams.find((t) => t.name === "Tano");
  const mvp = records[0];

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Copa por equipos</h2></div>
      <div className="teamsplit">
        <div className="teamcard pato">
          <div className="cap">Equipo</div><div className="nm">Pato</div>
          <div className="capn">{pato?.captain_player_id ? "Capitán · el Pato" : " "}</div>
          <div className="big">{pato ? teamScore[pato.id] ?? 0 : 0}</div>
        </div>
        <div className="teamcard tano">
          <div className="cap">Equipo</div><div className="nm">Tano</div>
          <div className="capn">{tano?.captain_player_id ? "Capitán · el Tano" : " "}</div>
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
      {err && <div className="center-msg">No se pudieron cargar los matches.</div>}
      {!days && !err && <Spinner />}
      {days?.map((d) => {
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
