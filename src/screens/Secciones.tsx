import { useEffect, useState } from "react";
import { useNav } from "../App";
import { useAppData } from "../data/AppData";
import { getCourses } from "../lib/queries_matches";
import { getAwards, getAllAwards, awardIcon, type AwardRow } from "../lib/awards";
import type { Course, Team } from "../lib/types";
import { displayName, Spinner } from "../ui/misc";

// Sponsors del torneo (fijos). Para sumar más, agregar el logo en public/sponsors/ y una línea acá.
const SPONSORS = [
  { name: "Ánimas Wealth Management", logo: "/sponsors/animas.png" },
  { name: "Easy Golf", logo: "/sponsors/easygolf.webp" },
];

function Back() {
  const nav = useNav();
  return <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>;
}

function titleOf(a: AwardRow): string {
  if (a.title) return a.title;
  const def: Record<string, string> = { teams: "Copa por equipos", stableford: "La Chaqueta", mvp: "MVP" };
  return (a.category && def[a.category]) || "Premio";
}
function winnerOf(a: AwardRow, teams: Team[]): string {
  if (a.playerName) return displayName(a.playerName);
  if (a.team_id) return teams.find((t) => t.id === a.team_id)?.name ? `Equipo ${teams.find((t) => t.id === a.team_id)!.name}` : (a.note ?? "—");
  return a.note ?? "A definir";
}

export function Premios() {
  const { edition, teams } = useAppData();
  const [awards, setAwards] = useState<AwardRow[] | null>(null);
  const [all, setAll] = useState<AwardRow[]>([]);

  useEffect(() => {
    if (!edition) return;
    getAwards(edition.id).then(setAwards).catch(() => setAwards([]));
    getAllAwards().then(setAll).catch(() => setAll([]));
  }, [edition]);

  const byEdition = new Map<string, AwardRow[]>();
  for (const a of all) {
    if (a.edition_id === edition?.id) continue;
    if (!byEdition.has(a.edition_id)) byEdition.set(a.edition_id, []);
    byEdition.get(a.edition_id)!.push(a);
  }
  const pastEds = [...byEdition.keys()].sort().reverse();

  return (
    <>
      <Back />
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Premios {edition?.year}</h2></div>
      {!awards ? <Spinner /> : awards.length === 0 ? (
        <div className="muted" style={{ padding: "0 4px" }}>Todavía no hay premios cargados. Un admin los agrega en Gestión → Premios.</div>
      ) : (
        <div className="card">
          {awards.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 13, alignItems: "center", padding: 14, borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gold-soft)", fontSize: 20, flex: "0 0 auto" }}>{awardIcon(a.category)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{titleOf(a)}</div>
                <div className="muted">
                  {winnerOf(a, teams)}{a.prize ? ` · ${a.prize}` : ""}
                </div>
              </div>
              {a.sponsor && <span className="chip" style={{ background: "var(--surface-2)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}>🎁 {a.sponsor}</span>}
            </div>
          ))}
        </div>
      )}

      <SponsorsBlock />

      <div className="sec-title"><h2>Palmarés</h2></div>
      <div className="card pad">
        {pastEds.length === 0 && <div className="muted">Sin ediciones anteriores.</div>}
        {pastEds.map((edId) => {
          const items = byEdition.get(edId)!;
          const t = items.find((i) => i.category === "teams");
          const s = items.find((i) => i.category === "stableford");
          const year = edId.replace("ed-", "");
          return (
            <div key={edId} style={{ padding: "6px 0 14px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: 16 }}>{year}</div>
              {t && <div className="muted" style={{ marginTop: 2 }}>Equipos · <b style={{ color: "var(--ink)" }}>{t.note ?? winnerOf(t, teams)}</b></div>}
              {s && <div className="muted">Stableford · <b style={{ color: "var(--ink)" }}>{s.playerName ? displayName(s.playerName) : s.note}</b> 🧥</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function SponsorsBlock() {
  if (SPONSORS.length === 0) return null;
  return (
    <>
      <div className="sec-title"><h2>Sponsors</h2></div>
      <div className="sponsors-grid">
        {SPONSORS.map((s) => (
          <div className="sponsor" key={s.name} title={s.name}><img src={s.logo} alt={s.name} /></div>
        ))}
      </div>
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
