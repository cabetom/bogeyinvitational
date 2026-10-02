import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { getFixtures } from "../lib/queries_matches";
import type { Fixture } from "../lib/types";
import { Avatar, displayName, Spinner } from "../ui/misc";

type Filter = "all" | "Pato" | "Tano";

export function Ranking() {
  const { ranking, loading, error, edition, reload } = useAppData();
  const { player } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  useEffect(() => {
    if (!edition) return;
    getFixtures(edition.id).then(setFixtures).catch(() => {});
  }, [edition?.id]);

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="center-msg">
        No se pudo cargar el ranking (¿sin señal?). Reintentando…
        <button className="btn-primary" onClick={reload}>Reintentar ahora</button>
      </div>
    );
  }

  const rows = ranking.filter((r) => filter === "all" || r.team?.name === filter);
  const anyCard = ranking.some((r) => r.rounds > 0);
  const drop = edition?.stableford_drop ?? 0;
  // La Chaqueta: solo si hay un líder solo (sin empate) y ya hay puntos.
  const leaderId = anyCard && ranking[0] && ranking[0].points > 0 && ranking[1]?.points !== ranking[0].points ? ranking[0].player.id : null;

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Ranking Stableford</h2><span className="muted">neto</span></div>
      <div className="segbar">
        {(["all", "Pato", "Tano"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "General" : f}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: "6px 12px" }}>
        <ul className="lead tabular">
          {rows.map((r) => {
            const me = player?.id === r.player.id;
            const pos = anyCard && r.rounds > 0 ? r.pos : null;
            return (
              <li key={r.player.id} className={`${pos != null && pos <= 3 && filter === "all" ? "top " : ""}${me ? "me" : ""}`.trim()}>
                <span className="pos">{pos ?? "–"}</span>
                <span className="who">
                  <Avatar player={r.player} team={r.team} size={32} />
                  <span>
                    <span className="nm">{displayName(r.player.full_name)}{r.player.id === leaderId ? " 🧥" : ""}</span>
                    <br />
                    <span className="tm">Equipo {r.team?.name ?? "—"}</span>
                    {fixtures.length > 0 && (
                      <span className="day-chips">
                        {fixtures.map((f) => {
                          const v = r.byFixture[f.id];
                          const drop = r.dropped.includes(f.id);
                          return <span key={f.id} className={v == null ? "miss" : drop ? "drop" : ""} title={drop ? "Descartada (la peor)" : undefined}>D{f.day_no} {v ?? "—"}</span>;
                        })}
                      </span>
                    )}
                  </span>
                </span>
                <span className="pts">{r.points}<small>pts</small>{r.dropped.length > 0 && <small className="pts-all">de {r.total}</small>}</span>
              </li>
            );
          })}
          {rows.length === 0 && <li style={{ justifyItems: "center" }}><span className="muted">Sin jugadores.</span></li>}
        </ul>
      </div>
      <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
        {!anyCard ? "Todavía no hay tarjetas cargadas." : drop > 0
          ? `Cuentan las mejores ${Math.max(0, fixtures.length - drop)} de ${fixtures.length} fechas: se descarta la peor tarjeta de cada uno (tachada). El mejor stableford se lleva la Chaqueta 🧥`
          : "Acumulado de todas las fechas · el mejor stableford se lleva la Chaqueta 🧥"}
      </p>
    </>
  );
}
