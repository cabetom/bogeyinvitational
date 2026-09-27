import { useEffect, useRef, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getRoster } from "../lib/queries";
import { getCourses, getFixtures, recomputeCards } from "../lib/queries_matches";
import { addPlayerToEdition, removeFromEdition, setEditionHandicap, setPlayerAdmin, setPlayerTeam } from "../lib/admin";
import { adminSetPlayerLogin, refreshHandicaps } from "../lib/auth";
import {
  addFixture, deleteFixture, fixtureDependents, getCourseHoles, saveCourseHoles, addCourse, setEditionTotalPoints,
  updateFixture, validateHoles, type HoleRow,
} from "../lib/adminSetup";
import { getAwards, addAward, deleteAward, AWARD_CATS, awardIcon, type AwardRow } from "../lib/awards";
import { createMatch, deleteMatch, getMatchesForFixture, type LiveMatch } from "../lib/liveMatches";
import { fixtureLabel, fmtDay, fmtTee, pickDefaultFixture } from "../lib/dates";
import { errText } from "../lib/errors";
import { fmtHcp, parseHcp } from "../lib/scoring";
import type { Course, Fixture, Modality, Player, Team } from "../lib/types";
import { Avatar, displayName, PlayerStatusMsg, shortName, Spinner } from "../ui/misc";

type Tab = "jugadores" | "fechas" | "canchas" | "partidos" | "premios";



export function Admin() {
  const nav = useNav();
  const { player, playerStatus } = useAuth();
  const { edition, isCurrent } = useAppData();
  const [tab, setTab] = useState<Tab>("jugadores");

  if (!player) return <PlayerStatusMsg status={playerStatus} />;
  if (!player.is_admin) {
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
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Gestión</h2><span className="muted">Edición {edition?.year}</span></div>
      {!isCurrent && (
        <div className="note warn"><span>⚠️</span><span>Estás editando la edición <b>{edition?.year}</b> (no la actual). Cambiala arriba si querés tocar la de este año.</span></div>
      )}
      <div className="segbar adm-tabs">
        <button className={tab === "jugadores" ? "on" : ""} onClick={() => setTab("jugadores")}>Jugadores</button>
        <button className={tab === "partidos" ? "on" : ""} onClick={() => setTab("partidos")}>Partidos</button>
        <button className={tab === "fechas" ? "on" : ""} onClick={() => setTab("fechas")}>Fechas</button>
        <button className={tab === "canchas" ? "on" : ""} onClick={() => setTab("canchas")}>Canchas</button>
        <button className={tab === "premios" ? "on" : ""} onClick={() => setTab("premios")}>Premios</button>
      </div>
      {tab === "jugadores" && <PlayersPanel />}
      {tab === "fechas" && <FixturesPanel />}
      {tab === "canchas" && <CoursesPanel />}
      {tab === "partidos" && <MatchesPanel />}
      {tab === "premios" && <AwardsPanel />}
    </>
  );
}

/* ---------------- Jugadores ---------------- */
interface RosterRow { player_id: string; team_id: string | null; handicap: number | null; players: Player; }

function PlayersPanel() {
  const { edition, teams, reload } = useAppData();
  const { player: me } = useAuth();
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [matricula, setMatricula] = useState("");
  const [teamId, setTeamId] = useState("");
  const [hcpEdit, setHcpEdit] = useState<Record<string, string>>({});

  async function refresh() {
    if (!edition) return;
    try {
      const r = (await getRoster(edition.id)) as unknown as RosterRow[];
      r.sort((a, b) => (a.team_id ?? "").localeCompare(b.team_id ?? "") || displayName(a.players.full_name).localeCompare(displayName(b.players.full_name)));
      setRoster(r);
    } catch (e) { setMsg(errText(e, "No se pudo cargar el plantel")); setRoster((x) => x ?? []); }
  }
  useEffect(() => { refresh(); if (teams[0]) setTeamId((t) => t || teams[0].id); /* eslint-disable-next-line */ }, [edition?.id, teams.length]);

  const teamObj = (id: string | null): Team | null => teams.find((t) => t.id === id) ?? null;

  async function act(fn: () => Promise<unknown>, fail: string, ok?: string) {
    setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await refresh(); reload(); }
    catch (e) { setMsg(errText(e, fail)); }
  }

  async function onAdd() {
    if (!edition || !name.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      const playerId = await addPlayerToEdition(edition.id, name.trim(), email.trim() || null, teamId || null);
      if (matricula.trim()) await adminSetPlayerLogin(playerId, matricula);
      setName(""); setEmail(""); setMatricula("");
      setMsg(matricula.trim() ? "✓ Jugador agregado — entra con su matrícula (usuario y contraseña)" : "✓ Jugador agregado (cargale la matrícula para que pueda entrar)");
      await refresh(); reload();
    } catch (e) { setMsg(errText(e, "No se pudo agregar")); } finally { setBusy(false); }
  }
  function onRemove(r: RosterRow) {
    if (!edition || !confirm(`¿Sacar a ${displayName(r.players.full_name)} del torneo ${edition.year}? (sus tarjetas quedan guardadas)`)) return;
    act(() => removeFromEdition(edition.id, r.player_id), "No se pudo sacar");
  }
  function onMatricula(r: RosterRow) {
    const m = prompt(`Matrícula de ${displayName(r.players.full_name)}`, r.players.matricula ?? "");
    if (m == null || !m.trim() || m.trim() === r.players.matricula) return;
    act(() => adminSetPlayerLogin(r.player_id, m), "No se pudo guardar la matrícula", `✓ ${displayName(r.players.full_name)} entra con ${m.trim()} (usuario y contraseña)`);
  }
  function onResetPassword(r: RosterRow) {
    if (!r.players.matricula) return;
    if (!confirm(`¿Resetear la contraseña de ${displayName(r.players.full_name)}? Va a volver a ser su matrícula (${r.players.matricula}) y la tendrá que cambiar al entrar.`)) return;
    act(() => adminSetPlayerLogin(r.player_id, r.players.matricula!, true), "No se pudo resetear", `✓ Contraseña de ${displayName(r.players.full_name)} reseteada a su matrícula`);
  }
  function onToggleAdmin(r: RosterRow) {
    const quitar = r.players.is_admin;
    if (quitar && r.player_id === me?.id) { setMsg("No te podés sacar el admin a vos mismo."); return; }
    if (!confirm(`¿${quitar ? "Sacarle" : "Darle"} permisos de admin a ${displayName(r.players.full_name)}?`)) return;
    act(() => setPlayerAdmin(r.player_id, !quitar), "No se pudo cambiar");
  }
  function onTeam(r: RosterRow, tid: string) {
    if (!edition) return;
    act(() => setPlayerTeam(edition.id, r.player_id, tid || null), "No se pudo cambiar el equipo");
  }
  function onHcpSave(r: RosterRow) {
    if (!edition) return;
    const raw = hcpEdit[r.player_id];
    if (raw == null) return;
    const v = parseHcp(raw);
    if (raw.trim() !== "" && (v == null || v < -10 || v > 54)) { setMsg(`Hándicap inválido para ${displayName(r.players.full_name)} (0 a 54, "+2" si es plus).`); return; }
    const clearEdit = () => setHcpEdit((p) => { const n = { ...p }; delete n[r.player_id]; return n; });
    if (v === r.handicap) { clearEdit(); return; }
    act(async () => { await setEditionHandicap(edition.id, r.player_id, v); clearEdit(); }, "No se pudo guardar el hándicap", `✓ Hándicap de ${displayName(r.players.full_name)}: ${v == null ? "sin cargar" : fmtHcp(v)}`);
  }

  const [wgBusy, setWgBusy] = useState(false);
  async function onWegolf() {
    const sync = confirm("¿Usar los hándicaps de we.golf también como hándicap del torneo?\n\nAceptar: los pone en el torneo (pisa los que cargaste a mano).\nCancelar: solo actualiza el índice de we.golf de cada uno.");
    setWgBusy(true); setMsg("Consultando we.golf… (unos segundos por jugador)");
    try {
      const { results } = await refreshHandicaps("edition", sync);
      const ok = results.filter((x) => x.ok).length;
      const bad = results.filter((x) => !x.ok).map((x) => displayName(x.name ?? "?"));
      setMsg(`✓ ${ok} hándicap(s) actualizados${sync ? " (también en el torneo)" : ""}${bad.length ? ` · sin datos: ${bad.join(", ")}` : ""}`);
      await refresh(); reload();
    } catch (e) { setMsg(errText(e, "No se pudo consultar we.golf")); }
    finally { setWgBusy(false); }
  }

  const missingHcp = roster?.filter((r) => r.handicap == null).length ?? 0;
  const noTeam = roster?.filter((r) => !r.team_id).length ?? 0;

  return (
    <>
      {msg && <p className={`save-msg ${msg.startsWith("✓") ? "ok" : "err"}`} style={{ marginBottom: 10 }}>{msg}</p>}

      <div className="sec-title" style={{ marginTop: 4 }}><h2>Plantel</h2><span className="muted">{roster?.length ?? 0} jugadores</span></div>
      <button className="btn-ghost" style={{ marginTop: 0, marginBottom: 8 }} disabled={wgBusy} onClick={onWegolf}>{wgBusy ? "Consultando we.golf…" : "↻ Traer hándicaps de we.golf"}</button>
      {(missingHcp > 0 || noTeam > 0) && (
        <div className="note warn"><span>⚠️</span><span>
          {missingHcp > 0 && <>{missingHcp} sin hándicap (Cargar lo usa por defecto). </>}
          {noTeam > 0 && <>{noTeam} sin equipo.</>}
        </span></div>
      )}
      {!roster ? <Spinner /> : (
        <div className="card" style={{ padding: "2px 12px" }}>
          {roster.map((r) => (
            <div key={r.player_id} className="adm-row">
              <div className="top">
                <Avatar player={r.players} team={teamObj(r.team_id)} size={34} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                    {displayName(r.players.full_name)}{r.players.is_admin && <span className="chip admin">🛡️ admin</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {r.players.matricula ? `Matrícula ${r.players.matricula}` : "⚠️ sin matrícula: no puede entrar"}
                    {r.players.handicap_index != null ? ` · we.golf ${fmtHcp(r.players.handicap_index)}` : ""}
                  </div>
                </div>
              </div>
              <div className="ctrls">
                <label className="muted" style={{ fontSize: 11 }}>Hcp</label>
                <input inputMode="decimal" aria-label="Hándicap"
                  value={hcpEdit[r.player_id] ?? fmtHcp(r.handicap)}
                  placeholder="—"
                  onChange={(e) => setHcpEdit((p) => ({ ...p, [r.player_id]: e.target.value.replace(/[^\d.,+-]/g, "") }))}
                  onBlur={() => onHcpSave(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <select value={r.team_id ?? ""} onChange={(e) => onTeam(r, e.target.value)} aria-label="Equipo">
                  <option value="">Sin equipo</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="mini-btn" onClick={() => onMatricula(r)}>{r.players.matricula ? "Matrícula" : "+ Matrícula"}</button>
                {r.players.matricula && <button className="mini-btn" onClick={() => onResetPassword(r)}>🔑 Reset clave</button>}
                <button className="mini-btn" onClick={() => onToggleAdmin(r)}>{r.players.is_admin ? "Quitar admin" : "Hacer admin"}</button>
                <button className="mini-btn danger" onClick={() => onRemove(r)} aria-label="Sacar del torneo">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-title"><h2>Agregar jugador</h2></div>
      <div className="card pad">
        <label className="form-lbl" style={{ marginTop: 0 }}>Nombre y apellido</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" />
        <label className="form-lbl">Matrícula (usuario y contraseña inicial)</label>
        <input className="field tabular" inputMode="numeric" value={matricula} onChange={(e) => setMatricula(e.target.value.replace(/\D/g, ""))} placeholder="Ej: 102587" />
        <label className="form-lbl">Email (Gmail, opcional — para entrar con Google)</label>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jugador@gmail.com" />
        <label className="form-lbl">Equipo</label>
        <select className="field" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-primary" disabled={busy || !name.trim()} onClick={onAdd}>{busy ? "Agregando…" : "Agregar jugador"}</button>
      </div>
    </>
  );
}

/* ---------------- Fechas ---------------- */
function FixturesPanel() {
  const { edition, reload } = useAppData();
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [date, setDate] = useState("");
  const [tee, setTee] = useState("");
  const [courseId, setCourseId] = useState("");
  const [modality, setModality] = useState<Modality>("fourball");
  const [totalPts, setTotalPts] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!edition) return;
    try { setFixtures(await getFixtures(edition.id)); } catch (e) { setMsg(errText(e, "No se pudieron cargar las fechas")); }
  }
  useEffect(() => {
    refresh();
    setTotalPts(edition?.total_points != null ? String(edition.total_points) : "");
    getCourses().then((c) => { setCourses(c); if (c[0]) setCourseId((x) => x || c[0].id); }).catch(() => {});
    /* eslint-disable-next-line */
  }, [edition?.id]);

  async function saveTotal() {
    if (!edition) return;
    setMsg(null);
    try {
      await setEditionTotalPoints(edition.id, totalPts ? Number(totalPts) : null);
      setMsg(`✓ Puntos en juego: ${totalPts || "sin definir"}`);
      reload();
    } catch (e) { setMsg(errText(e, "No se pudo guardar")); }
  }

  async function onAdd() {
    if (!edition || busy) return;
    setBusy(true); setMsg(null);
    try {
      const dayNo = (fixtures.reduce((m, f) => Math.max(m, f.day_no), 0) || 0) + 1;
      await addFixture(edition.id, dayNo, date || null, courseId || null, modality, tee || null);
      setDate(""); setTee(""); setMsg(`✓ Día ${dayNo} agregado`);
      await refresh(); reload();
    } catch (e) { setMsg(errText(e, "No se pudo agregar")); } finally { setBusy(false); }
  }
  async function onDelete(f: Fixture) {
    try {
      const dep = await fixtureDependents(f.id);
      const extra = dep.cards || dep.matches
        ? `\n\n⚠️ Se borran también ${dep.cards} tarjeta(s) y ${dep.matches} partido(s) de ese día. No se puede deshacer.`
        : "";
      if (!confirm(`¿Borrar el Día ${f.day_no}?${extra}`)) return;
      await deleteFixture(f.id); await refresh(); reload();
    } catch (e) { setMsg(errText(e, "No se pudo borrar")); }
  }
  async function onEdit(f: Fixture, patch: Parameters<typeof updateFixture>[1]) {
    setMsg(null);
    try {
      await updateFixture(f.id, patch);
      // cambió la cancha: recalcular las tarjetas ya cargadas de ese día con los hoyos nuevos
      if (patch.course_id !== undefined && patch.course_id) await recomputeCards({ fixtureId: f.id });
      await refresh(); reload();
    } catch (e) { setMsg(errText(e, "No se pudo guardar")); }
  }

  return (
    <>
      {msg && <p className={`save-msg ${msg.startsWith("✓") ? "ok" : "err"}`} style={{ marginBottom: 10 }}>{msg}</p>}
      <div className="sec-title" style={{ marginTop: 4 }}><h2>Fechas del {edition?.year}</h2></div>
      <div className="card pad">
        {fixtures.length === 0 && <div className="muted">Sin fechas todavía.</div>}
        {fixtures.map((f) => (
          <div className="adm-row" key={f.id}>
            <div className="top">
              <div className="fx-row" style={{ padding: 0, border: 0, flex: 1 }}>
                <div className="d">{f.day_no}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{f.courseName ?? "Sin cancha"}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{fmtDay(f.date) || "sin fecha"}{f.tee_time ? ` · ${fmtTee(f.tee_time)} hs` : ""} · {f.modality === "individual" ? "Individual" : "Fourball"}</div>
                </div>
              </div>
              <button className="mini-btn danger" onClick={() => onDelete(f)} aria-label="Borrar fecha">✕</button>
            </div>
            <div className="ctrls">
              <CommitInput type="date" value={f.date ?? ""} onCommit={(v) => onEdit(f, { date: v || null })} label="Fecha" />
              <CommitInput type="time" value={f.tee_time?.slice(0, 5) ?? ""} onCommit={(v) => onEdit(f, { tee_time: v || null })} label="Primer tee" />
              <select value={f.course_id ?? ""} onChange={(e) => onEdit(f, { course_id: e.target.value || null })} aria-label="Cancha">
                <option value="">Sin cancha</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={f.modality} onChange={(e) => onEdit(f, { modality: e.target.value as Modality })} aria-label="Modalidad">
                <option value="fourball">Fourball</option>
                <option value="individual">Individual</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="card pad" style={{ marginTop: 12 }}>
        <label className="form-lbl" style={{ marginTop: 0 }}>Puntos en juego del torneo (tablero de la Copa)</label>
        <input className="field tabular" inputMode="numeric" value={totalPts} onChange={(e) => setTotalPts(e.target.value.replace(/\D/g, ""))} placeholder="Ej: 10" />
        <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Un punto por partido: 3 días de fourball × 2 partidos + 4 individuales = 10.</p>
        <button className="btn-primary" onClick={saveTotal}>Guardar puntos en juego</button>
      </div>

      <div className="sec-title"><h2>Agregar fecha</h2></div>
      <div className="card pad">
        <label className="form-lbl" style={{ marginTop: 0 }}>Fecha (día)</label>
        <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="form-lbl">Primer tee time</label>
        <input className="field" type="time" value={tee} onChange={(e) => setTee(e.target.value)} />
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
        <button className="btn-primary" disabled={busy} onClick={onAdd}>Agregar fecha</button>
      </div>
    </>
  );
}

/* ---------------- Canchas ---------------- */
const emptyHoles = (): HoleRow[] => Array.from({ length: 18 }, (_, i) => ({ hole_no: i + 1, par: 0, stroke_index: 0 }));

function CoursesPanel() {
  const { reload } = useAppData();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [holes, setHoles] = useState<HoleRow[] | null>(null);
  const [loaded, setLoaded] = useState(false); // la cancha ya tenía sus 18 hoyos en la base
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const reqRef = useRef(0);

  async function loadCourses() {
    try {
      const c = await getCourses();
      setCourses(c);
      if (c[0]) setCourseId((x) => x || c[0].id);
    } catch (e) { setMsg(errText(e, "No se pudieron cargar las canchas")); }
  }
  useEffect(() => { loadCourses(); }, []);
  useEffect(() => {
    if (!courseId) return;
    const req = ++reqRef.current;
    setHoles(null); setMsg(null);
    getCourseHoles(courseId)
      .then((h) => { if (req !== reqRef.current) return; setLoaded(h.length === 18); setHoles(h.length === 18 ? h : emptyHoles()); })
      .catch((e) => { if (req === reqRef.current) setMsg(errText(e, "No se pudieron cargar los hoyos")); });
  }, [courseId]);

  function setHole(i: number, field: "par" | "stroke_index", raw: string) {
    const v = Number(raw.replace(/\D/g, "").slice(0, 2)) || 0;
    setHoles((prev) => prev ? prev.map((h, idx) => idx === i ? { ...h, [field]: v } : h) : prev);
  }
  async function save() {
    if (!courseId || !holes || busy) return;
    const err = validateHoles(holes);
    if (err) { setMsg(err); return; }
    setBusy(true); setMsg(null);
    try {
      await saveCourseHoles(courseId, holes);
      setLoaded(true);
      // las tarjetas ya cargadas en esta cancha se recalculan con los pares nuevos
      const changed = await recomputeCards({ courseId });
      setMsg(`✓ Pares guardados${changed ? ` · se recalcularon ${changed} tarjeta(s)` : ""}`);
      if (changed) reload();
    } catch (e) { setMsg(errText(e, "No se pudo guardar")); }
    finally { setBusy(false); }
  }
  async function onAddCourse() {
    if (!name.trim()) return;
    try {
      const c = await addCourse(code, name, url || null);
      setShowAdd(false); setCode(""); setName(""); setUrl("");
      await loadCourses(); setCourseId(c.id);
    } catch (e) { setMsg(errText(e, "No se pudo agregar la cancha")); }
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

      <div className="sec-title"><h2>Par y hándicap de cada hoyo</h2><span className="muted tabular">Par {parTotal || "—"}</span></div>
      {holes && !loaded && (
        <div className="note warn"><span>⚠️</span><span>Esta cancha todavía no tiene los hoyos cargados. Completá par y hándicap (1 = hoyo más difícil … 18 = más fácil) de los 18.</span></div>
      )}
      {!holes ? (msg ? null : <Spinner />) : (
        <div className="card pad">
          <div className="hole-edit"><span className="hl">Hoyo</span><span className="cap-lbl">Par</span><span className="cap-lbl">Hándicap (SI)</span></div>
          {holes.map((h, i) => (
            <div className="hole-edit" key={h.hole_no}>
              <span className="hl">{h.hole_no}</span>
              <input inputMode="numeric" value={h.par || ""} placeholder="—" onChange={(e) => setHole(i, "par", e.target.value)} />
              <input inputMode="numeric" value={h.stroke_index || ""} placeholder="—" onChange={(e) => setHole(i, "stroke_index", e.target.value)} />
            </div>
          ))}
        </div>
      )}
      <button className="btn-primary" disabled={busy || !holes} onClick={save}>{busy ? "Guardando…" : "Guardar hoyos"}</button>
      {msg && <p className={`save-msg ${msg.startsWith("✓") ? "ok" : "err"}`}>{msg}</p>}
    </>
  );
}

/* ---------------- Premios ---------------- */
function AwardsPanel() {
  const { edition, teams } = useAppData();
  const [awards, setAwards] = useState<AwardRow[] | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("stableford");
  const [winner, setWinner] = useState("");
  const [prize, setPrize] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    if (!edition) return;
    try { setAwards(await getAwards(edition.id)); } catch (e) { setMsg(errText(e, "No se pudieron cargar los premios")); setAwards((a) => a ?? []); }
  }
  useEffect(() => { refresh(); if (edition) getRoster(edition.id).then((r) => setRoster(r.map((x: any) => x.players))).catch(() => {}); /* eslint-disable-next-line */ }, [edition?.id]);

  const nameOf = (a: AwardRow) => a.playerName ? displayName(a.playerName) : (a.team_id ? `Equipo ${teams.find((t) => t.id === a.team_id)?.name ?? ""}` : "A definir");

  async function onAdd() {
    if (!edition || !title.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      let playerId: string | null = null, teamId: string | null = null;
      if (winner.startsWith("team:")) teamId = winner.slice(5);
      else if (winner.startsWith("player:")) playerId = winner.slice(7);
      await addAward(edition.id, { title, category, playerId, teamId, prize: prize || null, sponsor: sponsor || null });
      setTitle(""); setPrize(""); setSponsor(""); setWinner("");
      await refresh();
    } catch (e) { setMsg(errText(e, "No se pudo agregar")); } finally { setBusy(false); }
  }
  async function onDel(id: string) {
    if (!confirm("¿Borrar premio?")) return;
    try { await deleteAward(id); await refresh(); } catch (e) { setMsg(errText(e, "No se pudo borrar")); }
  }

  return (
    <>
      {msg && <p className="save-msg err" style={{ marginBottom: 10 }}>{msg}</p>}
      <div className="card pad">
        <label className="form-lbl" style={{ marginTop: 0 }}>Nombre del premio</label>
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: La Chaqueta / El Farolero / Longest Drive" />
        <label className="form-lbl">Tipo (ícono)</label>
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
          {AWARD_CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <label className="form-lbl">Ganador (opcional)</label>
        <select className="field" value={winner} onChange={(e) => setWinner(e.target.value)}>
          <option value="">— a definir —</option>
          {teams.map((t) => <option key={t.id} value={`team:${t.id}`}>Equipo {t.name}</option>)}
          {roster.map((p) => <option key={p.id} value={`player:${p.id}`}>{displayName(p.full_name)}</option>)}
        </select>
        <label className="form-lbl">¿Qué se lleva? (opcional)</label>
        <input className="field" value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Ej: Chaqueta verde / Docena de Pro V1" />
        <label className="form-lbl">Sponsor del premio (opcional)</label>
        <input className="field" value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Ej: Golf House" />
        <button className="btn-primary" disabled={busy || !title.trim()} onClick={onAdd}>{busy ? "Guardando…" : "Agregar premio"}</button>
      </div>

      <div className="sec-title"><h2>Premios de {edition?.year}</h2></div>
      {!awards ? <Spinner /> : (
        <div className="card pad">
          {awards.length === 0 && <div className="muted">Sin premios cargados.</div>}
          {awards.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 2px", borderBottom: "1px solid var(--line-soft)" }}>
              <span style={{ fontSize: 20 }}>{awardIcon(a.category)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title ?? "Premio"}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{nameOf(a)}{a.prize ? ` · ${a.prize}` : ""}{a.sponsor ? ` · 🎁 ${a.sponsor}` : ""}</div>
              </div>
              <button className="mini-btn danger" onClick={() => onDel(a.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- Partidos (parejas) ---------------- */
function MatchesPanel() {
  const { edition, teams, reload } = useAppData();
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);
  const [pa1, setPa1] = useState(""); const [pa2, setPa2] = useState("");
  const [tb1, setTb1] = useState(""); const [tb2, setTb2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rosterErr, setRosterErr] = useState(false);

  const patoTeam = teams.find((t) => t.name === "Pato");
  const tanoTeam = teams.find((t) => t.name === "Tano");
  const fixture = fixtures.find((f) => f.id === fixtureId);
  const singles = fixture?.modality === "individual";

  async function refreshMatches() {
    if (!fixtureId) { setMatches([]); return; }
    try { setMatches(await getMatchesForFixture(fixtureId)); } catch (e) { setMsg(errText(e, "No se pudieron cargar los partidos")); setMatches((m) => m ?? []); }
  }
  useEffect(() => {
    if (!edition) return;
    getFixtures(edition.id).then((fx) => { setFixtures(fx); setFixtureId((x) => (x && fx.some((f) => f.id === x) ? x : pickDefaultFixture(fx)?.id || "")); }).catch((e) => setMsg(errText(e, "No se pudieron cargar las fechas")));
    setRosterErr(false);
    getRoster(edition.id).then((r) => setRoster(r as unknown as RosterRow[])).catch(() => setRosterErr(true));
  }, [edition?.id]);
  useEffect(() => { setPa1(""); setPa2(""); setTb1(""); setTb2(""); setMatches(null); refreshMatches(); /* eslint-disable-next-line */ }, [fixtureId]);

  const taken = new Set((matches ?? []).flatMap((m) => [...m.sideA, ...m.sideB].map((p) => p.id)));
  const patoPlayers = roster.filter((r) => r.team_id === patoTeam?.id && !taken.has(r.player_id));
  const tanoPlayers = roster.filter((r) => r.team_id === tanoTeam?.id && !taken.has(r.player_id));

  async function onCreate() {
    if (!fixtureId || !patoTeam || !tanoTeam || busy) return;
    const patoIds = (singles ? [pa1] : [pa1, pa2]).filter(Boolean);
    const tanoIds = (singles ? [tb1] : [tb1, tb2]).filter(Boolean);
    const need = singles ? 1 : 2;
    if (patoIds.length !== need || tanoIds.length !== need) { setMsg(singles ? "Elegí un jugador de cada equipo." : "Elegí los dos jugadores de cada pareja."); return; }
    if (new Set(patoIds).size !== patoIds.length || new Set(tanoIds).size !== tanoIds.length) { setMsg("Elegiste el mismo jugador dos veces."); return; }
    setBusy(true); setMsg(null);
    try {
      await createMatch(fixtureId, patoTeam.id, tanoTeam.id, patoIds, tanoIds, singles ? "individual" : "fourball");
      setPa1(""); setPa2(""); setTb1(""); setTb2("");
      setMsg("✓ Partido creado");
      await refreshMatches(); reload();
    } catch (e) { setMsg(errText(e, "No se pudo crear el partido")); } finally { setBusy(false); }
  }
  async function onDel(m: LiveMatch) {
    const extra = m.status !== "pendiente" ? "\n\n⚠️ Ya tiene resultado cargado: se pierde." : "";
    if (!confirm(`¿Borrar este partido?${extra}`)) return;
    try { await deleteMatch(m.id); await refreshMatches(); reload(); } catch (e) { setMsg(errText(e, "No se pudo borrar")); }
  }

  const opt = (list: RosterRow[], exclude: string) => list.filter((r) => r.player_id !== exclude).map((r) => <option key={r.player_id} value={r.player_id}>{displayName(r.players.full_name)}</option>);
  const statusLbl = (m: LiveMatch) => m.status === "final" ? (m.winner === "H" ? "AS" : `${m.winner === "A" ? "Pato" : "Tano"} ${m.margin ?? ""}`) : m.status === "en_juego" ? "en juego" : "por jugar";

  return (
    <>
      <label className="form-lbl" style={{ marginTop: 4 }}>Fecha</label>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)} · {f.modality === "individual" ? "Individual" : "Fourball"}</option>)}
        {fixtures.length === 0 && <option value="">Sin fechas</option>}
      </select>

      <div className="sec-title"><h2>Partidos del día</h2><span className="muted">{matches?.length ?? 0}</span></div>
      {!matches ? <Spinner /> : (
        <div className="card pad">
          {matches.length === 0 && <div className="muted">Sin partidos armados.</div>}
          {matches.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 2px", borderBottom: "1px solid var(--line-soft)", fontSize: 12.5 }}>
              <div style={{ flex: 1 }}>🦆 {m.sideA.map((p) => shortName(p.full_name)).join(" / ")} <span style={{ color: "var(--ink-faint)" }}>vs</span> {m.sideB.map((p) => shortName(p.full_name)).join(" / ")} 🇮🇹</div>
              <span className="muted" style={{ fontSize: 11 }}>{statusLbl(m)}</span>
              <button className="mini-btn danger" onClick={() => onDel(m)} aria-label="Borrar partido">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="sec-title"><h2>Armar {singles ? "partido individual" : "pareja vs pareja"}</h2></div>
      <div className="card pad">
        {rosterErr ? (
          <div className="muted">No se pudo cargar el plantel (¿sin señal?). Volvé a entrar a esta pestaña.</div>
        ) : patoPlayers.length === 0 && tanoPlayers.length === 0 && matches && matches.length > 0 ? (
          <div className="muted">Ya están todos los jugadores asignados para este día. ✓</div>
        ) : (
          <>
            <div className="eyebrow" style={{ marginBottom: 6, color: "var(--pato)" }}>🦆 {singles ? "Jugador Pato" : "Pareja Pato"}</div>
            <div className={singles ? "" : "grid2"}>
              <select className="field" value={pa1} onChange={(e) => setPa1(e.target.value)}><option value="">{singles ? "Jugador" : "Jugador 1"}</option>{opt(patoPlayers, pa2)}</select>
              {!singles && <select className="field" value={pa2} onChange={(e) => setPa2(e.target.value)}><option value="">Jugador 2</option>{opt(patoPlayers, pa1)}</select>}
            </div>
            <div className="eyebrow" style={{ margin: "12px 0 6px", color: "var(--tano)" }}>🇮🇹 {singles ? "Jugador Tano" : "Pareja Tano"}</div>
            <div className={singles ? "" : "grid2"}>
              <select className="field" value={tb1} onChange={(e) => setTb1(e.target.value)}><option value="">{singles ? "Jugador" : "Jugador 1"}</option>{opt(tanoPlayers, tb2)}</select>
              {!singles && <select className="field" value={tb2} onChange={(e) => setTb2(e.target.value)}><option value="">Jugador 2</option>{opt(tanoPlayers, tb1)}</select>}
            </div>
            <button className="btn-primary" disabled={busy} onClick={onCreate}>{busy ? "Creando…" : "Crear partido"}</button>
          </>
        )}
        {msg && <p className={`save-msg ${msg.startsWith("✓") ? "ok" : "err"}`}>{msg}</p>}
      </div>
    </>
  );
}

/** Input que guarda cuando se termina de editar (al salir, con Enter o 1,5 s después del último cambio), no en cada tecla. */
function CommitInput({ type, value, onCommit, label }: { type: "date" | "time"; value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  const timer = useRef<number | null>(null);
  const latest = useRef(v);
  useEffect(() => { setV(value); latest.current = value; }, [value]);
  const commit = () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    if (latest.current !== value) onCommit(latest.current);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return (
    <input type={type} style={{ width: "auto" }} value={v} aria-label={label}
      onChange={(e) => {
        setV(e.target.value); latest.current = e.target.value;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(commit, 1500);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
