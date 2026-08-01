import { useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { Avatar, displayName, Spinner } from "../ui/misc";

type Filter = "all" | "Pato" | "Tano";

export function Ranking() {
  const { ranking, loading, error } = useAppData();
  const { player } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  if (loading) return <Spinner />;
  if (error) return <div className="center-msg">No se pudo cargar el ranking.<br />{error}</div>;

  const rows = ranking.filter((r) => filter === "all" || r.team?.name === filter);

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Ranking Stableford</h2></div>
      <div className="segbar">
        {(["all", "Pato", "Tano"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "General" : f}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: "6px 12px" }}>
        <ul className="lead tabular">
          {rows.map((r, i) => {
            const me = player?.id === r.player.id;
            return (
              <li key={r.player.id} className={`${i < 3 && filter === "all" ? "top " : ""}${me ? "me" : ""}`.trim()}>
                <span className="pos">{i + 1}</span>
                <span className="who">
                  <Avatar player={r.player} team={r.team} size={32} />
                  <span>
                    <span className="nm">{displayName(r.player.full_name)}{i === 0 && filter === "all" ? " 🧥" : ""}</span>
                    <br />
                    <span className="tm">Equipo {r.team?.name ?? "—"} · {r.rounds} {r.rounds === 1 ? "vuelta" : "vueltas"}</span>
                  </span>
                </span>
                <span className="pts">{r.points}<small>pts</small></span>
              </li>
            );
          })}
          {rows.length === 0 && <li style={{ justifyItems: "center" }}><span className="muted">Sin tarjetas todavía.</span></li>}
        </ul>
      </div>
      <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
        Acumulado de todas las fechas · el mejor stableford se lleva la Chaqueta 🧥
      </p>
    </>
  );
}
