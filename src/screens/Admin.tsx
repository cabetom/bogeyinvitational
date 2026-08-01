import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getRoster } from "../lib/queries";
import { getCourses, getFixtures } from "../lib/queries_matches";
import { addPlayerToEdition, removeFromEdition, setPlayerAdmin } from "../lib/admin";
import {
  addFixture, deleteFixture, getCourseHoles, saveCourseHoles, addCourse, type HoleRow,
} from "../lib/adminSetup";
import type { Course, Fixture, Modality, Player, Team } from "../lib/types";
import { Avatar, displayName, Spinner } from "../ui/misc";

type Tab = "jugadores" | "fechas" | "canchas";

export function Admin() {
  const nav = useNav();
  const { player } = useAuth();
  const [tab, setTab] = useState<Tab>("jugadores");

  if (!player?.is_admin) {
    return (
      <>
        <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
        <div className="center-msg">Esta sección es solo para administradores.</div>
      </>
    );
  }

  return (
    <>
      <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Gestión</h2></div>
      <div className="segbar adm-tabs">
        <button className={tab === "jugadores" ? "on" : ""} onClick={() => setTab("jugadores")}>Jugadores</button>
        <button className={tab === "fechas" ? "on" : ""} onClick={() => setTab("fechas")}>Fechas</button>
        <button className={tab === "canchas" ? "on" : ""} onClick={() => setTab("canchas")}>Canchas</button>
      </div>
      {tab === "jugadores" && <PlayersPanel />}
      {tab === "fechas" && <FixturesPanel />}
      {tab === "canchas" && <CoursesPanel />}
    </>
  );
}

/* ---------------- Jugadores ---------------- */
interface RosterRow { player_id: string; team_id: string | null; handicap: number | null; players: Player; }

function PlayersPanel() {
  const { edition, teams, reload } = useAppData();
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");

  async function refresh() {
    if (!edition) return;
    const r = (await getRoster(edition.id)) as unknown as RosterRow[];
    r.sort((a, b) => displayName(a.players.full_name).localeCompare(displayName(b.players.full_name)));
    setRoster(r);
  }
  useEffect(() => { refresh(); if (teams[0]) setTeamId((t) => t || teams[0].id); /* eslint-disable-next-line */ }, [edition, teams]);

  const teamObj = (id: string | null): Team | null => teams.find((t) => t.id === id) ?? null;
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  async function onAdd() {
    if (!edition || !name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await addPlayerToEdition(edition.id, name.trim(), email.trim() || null, teamId || null);
      setName(""); setEmail(""); setMsg("✓ Jugador agregado"); await refresh(); reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : "No se pudo agregar"); } finally { setBusy(false); }
  }
  async function onRemove(r: RosterRow) {
    if (!edition || !confirm(`¿Sacar a ${displayName(r.players.full_name)} del torneo ${edition.year}?`)) return;
    await removeFromEdition(edition.id, r.player_id); await refresh(); reload();
  }
  async function onToggleAdmin(r: RosterRow) {
    await setPlayerAdmin(r.player_id, !r.players.is_admin); await refresh();
  }

  return (
    <>
      <div className="card pad">
        <label className="form-lbl" style={{ marginTop: 0 }}>Nombre y apellido</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" />
        <label className="form-lbl">Email (Gmail para el login)</label>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jugador@gmail.com" />
        <label className="form-lbl">Equipo</label>
        <select className="field" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-primary" disabled={busy || !name.trim()} onClick={onAdd}>{busy ? "Agregando…" : "Agregar jugador"}</button>
        {msg && <p style={{ textAlign: "center", marginTop: 10, fontWeight: 600, color: "var(--pine)" }}>{msg}</p>}
      </div>

      <div className="sec-title"><h2>Plantel</h2><span className="muted">{roster?.length ?? 0}</span></div>
      {!roster ? <Spinner /> : (
        <div className="card" style={{ padding: "4px 12px" }}>
          {roster.map((r) => (
            <div key={r.player_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--line-soft)" }}>
              <Avatar player={r.players} team={teamObj(r.team_id)} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                  {displayName(r.players.full_name)}{r.players.is_admin && <span className="chip admin">🛡️</span>}
                </div>
                <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.players.email || "sin email — no puede entrar"} · {teamName(r.team_id)}
                </div>
              </div>
              <button className="mini-btn" onClick={() => onToggleAdmin(r)}>{r.players.is_admin ? "Quitar admin" : "Hacer admin"}</button>
              <button className="mini-btn danger" onClick={() => onRemove(r)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- Fechas ---------------- */
function FixturesPanel() {
  const { edition, reload } = useAppData();
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [modality, setModality] = useState<Modality>("fourball");

  async function refresh() {
    if (!edition) return;
    setFixtures(await getFixtures(edition.id));
  }
  useEffect(() => { refresh(); getCourses().then((c) => { setCourses(c); if (c[0]) setCourseId((x) => x || c[0].id); }); /* eslint-disable-next-line */ }, [edition]);

  async function onAdd() {
    if (!edition) return;
    const dayNo = (fixtures.reduce((m, f) => Math.max(m, f.day_no), 0) || 0) + 1;
    await addFixture(edition.id, dayNo, date || null, courseId || null, modality);
    setDate(""); await refresh(); reload();
  }
  async function onDelete(id: string) {
    if (!confirm("¿Borrar esta fecha?")) return;
    await deleteFixture(id); await refresh(); reload();
  }

  return (
    <>
      <div className="card pad">
        <label className="form-lbl" style={{ marginTop: 0 }}>Fecha (día)</label>
        <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="form-lbl">Cancha</label>
        <select className="field" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {courses.length === 0 && <option value="">— agregá una cancha primero —</option>}
        </select>
        <label className="form-lbl">Modalidad</label>
        <select className="field" value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
          <option value="fourball">Fourball</option>
          <option value="individual">Individual</option>
        </select>
        <button className="btn-primary" onClick={onAdd}>Agregar fecha</button>
      </div>

      <div className="sec-title"><h2>Fechas del {edition?.year}</h2></div>
      <div className="card pad">
        {fixtures.length === 0 && <div className="muted">Sin fechas todavía.</div>}
        {fixtures.map((f) => (
          <div className="fx-row" key={f.id}>
            <div className="d">{f.day_no}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.courseName ?? "Sin cancha"}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{f.date ?? "sin fecha"} · {f.modality === "individual" ? "Individual" : "Fourball"}</div>
            </div>
            <button className="mini-btn danger" style={{ marginLeft: "auto" }} onClick={() => onDelete(f.id)}>✕</button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- Canchas ---------------- */
function defaultHoles(): HoleRow[] {
  return Array.from({ length: 18 }, (_, i) => ({ hole_no: i + 1, par: 4, stroke_index: i + 1 }));
}

function CoursesPanel() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [holes, setHoles] = useState<HoleRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  async function loadCourses() {
    const c = await getCourses();
    setCourses(c);
    if (c[0]) setCourseId((x) => x || c[0].id);
  }
  useEffect(() => { loadCourses(); }, []);
  useEffect(() => {
    if (!courseId) return;
    setHoles(null);
    getCourseHoles(courseId).then((h) => setHoles(h.length === 18 ? h : defaultHoles())).catch(() => setHoles(defaultHoles()));
  }, [courseId]);

  function setHole(i: number, field: "par" | "stroke_index", v: number) {
    setHoles((prev) => prev ? prev.map((h, idx) => idx === i ? { ...h, [field]: v } : h) : prev);
  }
  async function save() {
    if (!courseId || !holes) return;
    setBusy(true); setMsg(null);
    try { await saveCourseHoles(courseId, holes); setMsg("✓ Pares guardados"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  }
  async function onAddCourse() {
    if (!name.trim()) return;
    const c = await addCourse(code, name, url || null);
    setShowAdd(false); setCode(""); setName(""); setUrl("");
    await loadCourses(); setCourseId(c.id);
  }

  const parTotal = holes?.reduce((s, h) => s + (h.par || 0), 0) ?? 0;

  return (
    <>
      <label className="form-lbl" style={{ marginTop: 4 }}>Cancha</label>
      <select className="field" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {showAdd ? (
        <div className="card pad" style={{ marginTop: 10 }}>
          <label className="form-lbl" style={{ marginTop: 0 }}>Código (3 letras)</label>
          <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TER" maxLength={6} />
          <label className="form-lbl">Nombre</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="El Terrón Golf Club" />
          <label className="form-lbl">Link de Maps (opcional)</label>
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.google.com/..." />
          <button className="btn-primary" onClick={onAddCourse}>Guardar cancha</button>
          <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancelar</button>
        </div>
      ) : (
        <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>＋ Agregar cancha</button>
      )}

      <div className="sec-title"><h2>Pares · SI</h2><span className="muted tabular">Par {parTotal}</span></div>
      {!holes ? <Spinner /> : (
        <div className="card pad">
          <div className="hole-edit"><span className="hl">Hoyo</span><span className="cap-lbl">Par</span><span className="cap-lbl">Hándicap (SI)</span></div>
          {holes.map((h, i) => (
            <div className="hole-edit" key={h.hole_no}>
              <span className="hl">{h.hole_no}</span>
              <input type="number" min={3} max={6} value={h.par} onChange={(e) => setHole(i, "par", Number(e.target.value))} />
              <input type="number" min={1} max={18} value={h.stroke_index} onChange={(e) => setHole(i, "stroke_index", Number(e.target.value))} />
            </div>
          ))}
        </div>
      )}
      <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar pares"}</button>
      {msg && <p style={{ textAlign: "center", marginTop: 10, fontWeight: 600, color: "var(--pine)" }}>{msg}</p>}
    </>
  );
}
