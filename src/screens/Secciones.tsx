import { useEffect, useState } from "react";
import { useNav } from "../App";
import { useAppData } from "../data/AppData";
import { getAwards, getCourses, type AwardRow } from "../lib/queries_matches";
import type { Course } from "../lib/types";
import { displayName, Spinner } from "../ui/misc";

function Back() {
  const nav = useNav();
  return <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>;
}

const PREMIOS = [
  { medal: "🧥", t: "La Chaqueta · Stableford individual", s: "Mejor acumulado de las fechas" },
  { medal: "🏆", t: "Copa por equipos", s: "Suma de fourball + individuales" },
  { medal: "👑", t: "MVP", s: "Mejor récord de matches del torneo" },
  { medal: "🚀", t: "Longest Drive", s: "El drive más largo del viaje" },
  { medal: "🦆", t: "El Pato de Oro", s: "Al peor score del torneo (con cariño)" },
];

export function Premios() {
  const [awards, setAwards] = useState<AwardRow[] | null>(null);
  useEffect(() => { getAwards().then(setAwards).catch(() => setAwards([])); }, []);

  const byEdition = new Map<string, AwardRow[]>();
  for (const a of awards ?? []) {
    if (!byEdition.has(a.edition_id)) byEdition.set(a.edition_id, []);
    byEdition.get(a.edition_id)!.push(a);
  }
  const editions = [...byEdition.keys()].sort().reverse();

  return (
    <>
      <Back />
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Premios</h2></div>
      <div className="card">
        {PREMIOS.map((p) => (
          <div key={p.t} style={{ display: "flex", gap: 13, alignItems: "center", padding: 14, borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gold-soft)", fontSize: 20, flex: "0 0 auto" }}>{p.medal}</div>
            <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.t}</div><div className="muted">{p.s}</div></div>
          </div>
        ))}
      </div>

      <div className="sec-title"><h2>Palmarés</h2></div>
      {!awards ? <Spinner /> : (
        <div className="card pad">
          {editions.map((edId) => {
            const items = byEdition.get(edId)!;
            const teams = items.find((i) => i.category === "teams");
            const stb = items.find((i) => i.category === "stableford");
            const year = edId.replace("ed-", "");
            return (
              <div key={edId} style={{ padding: "6px 0 14px", borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: 16 }}>{year}</div>
                {teams && <div className="muted" style={{ marginTop: 2 }}>Equipos · <b style={{ color: "var(--ink)" }}>{teams.note}</b></div>}
                {stb && <div className="muted">Stableford · <b style={{ color: "var(--ink)" }}>{stb.playerName ? displayName(stb.playerName) : stb.note}</b> 🧥</div>}
              </div>
            );
          })}
          {editions.length === 0 && <div className="muted">Sin palmarés cargado.</div>}
        </div>
      )}
    </>
  );
}

export function Viaje() {
  const { edition } = useAppData();
  const [courses, setCourses] = useState<Course[] | null>(null);
  useEffect(() => { getCourses().then(setCourses).catch(() => setCourses([])); }, []);

  return (
    <>
      <Back />
      <div className="sec-title" style={{ marginTop: 2 }}><h2>El viaje</h2></div>
      <div className="card pad">
        <Info k="Destino" v={edition?.location ?? "—"} />
        <Info k="Edición" v={edition?.name ?? "—"} />
        <Info k="Jugadores" v="16 · 2 equipos" />
      </div>

      <div className="sec-title"><h2>Las canchas</h2></div>
      {!courses ? <Spinner /> : (
        <div className="card">
          {courses.map((c) => (
            <a key={c.id} href={c.location_url ?? "#"} target="_blank" rel="noopener"
              style={{ display: "flex", gap: 12, alignItems: "center", padding: 13, borderBottom: "1px solid var(--line-soft)", textDecoration: "none", color: "inherit" }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: "var(--pine)", color: "#F2EFE2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontWeight: 700, fontSize: 13, flex: "0 0 auto" }}>{c.id}</div>
              <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div><div className="muted">Par {c.par_total}</div></div>
              <span style={{ marginLeft: "auto", color: "var(--pine-soft)" }}>›</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 11, padding: "12px 2px", borderBottom: "1px solid var(--line-soft)", fontSize: 13 }}>
      <span className="muted">{k}</span><span style={{ marginLeft: "auto", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

function Soon({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="center-msg">
      <div style={{ fontSize: 40 }}>{icon}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginTop: 8 }}>{title}</div>
      <p style={{ maxWidth: 280, margin: "8px auto 0" }}>{text}</p>
    </div>
  );
}

export function Camionetas() {
  return (
    <><Back /><Soon icon="🚐" title="Camionetas" text="Acá vas a asignar quién maneja y con quién viaja, de ida y de vuelta. Lo activamos cuando definamos vehículos y fechas." /></>
  );
}

export function Presupuesto() {
  return (
    <><Back /><Soon icon="💸" title="Presupuesto y gastos" text="Presupuesto estimado y Splitwise interno: quién pagó qué y cómo se salda. Lo activamos al cargar los primeros gastos." /></>
  );
}
