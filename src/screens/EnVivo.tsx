import { useEffect, useRef, useState, useCallback } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { supabase } from "../lib/supabase";
import { getFixtures, withTimeout } from "../lib/queries_matches";
import { getMatchesForFixture, saveLive, finishMatch, matchMargin, type LiveMatch } from "../lib/liveMatches";
import { fixtureLabel, pickDefaultFixture } from "../lib/dates";
import { errText } from "../lib/errors";
import type { Fixture } from "../lib/types";
import { shortName, Spinner } from "../ui/misc";

function statusText(m: LiveMatch): { txt: string; cls: string } {
  if (m.status === "final") {
    if (m.winner === "H") return { txt: "AS · ½ c/u", cls: "h" };
    const t = m.winner === "A" ? "Pato" : "Tano";
    const margin = m.margin && m.margin !== "AS" ? m.margin : m.up ? `${Math.abs(m.up)} up` : "";
    return { txt: `Ganó ${t} ${margin}`.trim(), cls: m.winner === "A" ? "pato" : "tano" };
  }
  if (m.status === "en_juego") {
    const up = m.up ?? 0;
    const lead = up === 0 ? "Empatados" : `${up > 0 ? "Pato" : "Tano"} ${Math.abs(up)} arriba`;
    return { txt: `${lead}${m.thru ? ` · hoyo ${m.thru}` : ""}`, cls: up > 0 ? "pato" : up < 0 ? "tano" : "h" };
  }
  return { txt: "Por empezar", cls: "h" };
}

export function EnVivo() {
  const nav = useNav();
  const { edition, isCurrent, teams } = useAppData();
  const { player } = useAuth();
  const teamAId = teams.find((t) => t.name === "Pato")?.id ?? "";
  const teamBId = teams.find((t) => t.name === "Tano")?.id ?? "";
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [fxTry, setFxTry] = useState(0);
  const reqRef = useRef(0);

  // Fechas de la edición; si falla (sin señal) se reintenta sola cada 10s.
  useEffect(() => {
    if (!edition) return;
    let alive = true;
    getFixtures(edition.id)
      .then((fx) => {
        if (!alive) return;
        setFixtures(fx);
        setFixtureId((id) => (id && fx.some((f) => f.id === id) ? id : pickDefaultFixture(fx)?.id ?? ""));
        setLoadErr(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoadErr(true);
        window.setTimeout(() => { if (alive) setFxTry((n) => n + 1); }, 10000);
      });
    return () => { alive = false; };
  }, [edition?.id, fxTry]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    if (!fixtureId) { setFxTry((n) => n + 1); return; }
    const req = ++reqRef.current; // descartar respuestas viejas (otro día o un poll anterior)
    getMatchesForFixture(fixtureId)
      .then((m) => { if (req !== reqRef.current) return; setMatches(m); setLoadErr(false); })
      .catch(() => { if (req === reqRef.current) setLoadErr(true); }); // conservar lo último que se vio
  }, [fixtureId]);

  useEffect(() => { setMatches(null); if (fixtureId) refresh(); }, [fixtureId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Realtime instantáneo + fallback de auto-refresh cada 20s
  useEffect(() => {
    if (!fixtureId) return;
    const ch = supabase
      .channel("envivo-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results" }, () => refresh())
      .subscribe();
    const t = setInterval(refresh, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [refresh, fixtureId]);

  if (!edition) return <Spinner />;

  const myId = player?.id;
  const isMine = (m: LiveMatch) => !!myId && (m.sideA.some((p) => p.id === myId) || m.sideB.some((p) => p.id === myId));
  const canEdit = (m: LiveMatch) => isCurrent && (isMine(m) || !!player?.is_admin);

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}>
        <h2>🔴 En vivo</h2>
        <button className="link" onClick={refresh}>↻ Actualizar</button>
      </div>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>)}
        {fixtures.length === 0 && <option value="">{loadErr ? "Cargando fechas…" : "Sin fechas"}</option>}
      </select>
      {loadErr && <div className="note warn"><span>📶</span><span>Sin conexión: lo que ves puede estar desactualizado. Reintentando…</span></div>}

      {!fixtureId ? null : !matches ? (loadErr ? null : <Spinner />) : matches.length === 0 ? (
        <div className="center-msg">Todavía no hay partidos armados para este día.<br />Los capitanes los arman en Más → Gestión → Partidos.</div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {matches.map((m) => (
            <MatchCard key={m.id} m={m} editable={canEdit(m)} teamAId={teamAId} teamBId={teamBId} onSaved={refresh} />
          ))}
        </div>
      )}
      <p className="muted" style={{ textAlign: "center", marginTop: 14 }}>
        Se actualiza solo. Cargá cómo va tu partido y todos lo ven al toque.
      </p>
      <button className="btn-ghost" onClick={() => nav("equipos")}>Ver la Copa (Ryder)</button>
    </>
  );
}

type Lead = "A" | "H" | "B";

function MatchCard({ m, editable, teamAId, teamBId, onSaved }: { m: LiveMatch; editable: boolean; teamAId: string; teamBId: string; onSaved: () => void }) {
  const st = statusText(m);
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<Lead>("H");
  const [diff, setDiff] = useState(1);
  const [thru, setThru] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // El editor arranca SIEMPRE desde lo último guardado (no desde un estado viejo).
  function openEditor() {
    const up = m.up ?? 0;
    setLead(up > 0 ? "A" : up < 0 ? "B" : "H");
    setDiff(Math.abs(up) || 1);
    setThru(m.thru ?? 0);
    setErr(null); setOk(null);
    setOpen(true);
  }

  const up = lead === "H" ? 0 : lead === "A" ? diff : -diff;
  const remaining = thru > 0 ? 18 - thru : 18;
  const decided = up !== 0 && Math.abs(up) > remaining;
  const sideName = (s: "A" | "B") => (s === "A" ? "Pato" : "Tano");
  const summary = up === 0 ? "Empate (½ punto cada uno)" : `Gana ${sideName(up > 0 ? "A" : "B")} ${matchMargin(up, thru || null)}`;

  async function run(fn: () => Promise<void>, okText: string) {
    setBusy(true); setErr(null);
    try {
      await withTimeout(fn(), 15000);
      setOpen(false);
      setOk(okText);
      onSaved();
    } catch (e) {
      setErr(errText(e, "No se pudo guardar"));
    } finally { setBusy(false); }
  }

  function partial() {
    if (m.status === "final" && !confirm("Este partido ya estaba cerrado. ¿Reabrirlo como 'en juego'? (deja de sumar el punto hasta que se cierre de nuevo)")) return;
    run(() => saveLive(m.id, up, thru || null), "✓ Guardado");
  }
  function final() {
    const aId = m.teamAId ?? teamAId;
    const bId = m.teamBId ?? teamBId;
    if (!aId || !bId) { setErr("No se pudo identificar a los equipos del partido. Actualizá y probá de nuevo."); return; }
    const early = thru > 0 && thru < 18 && up !== 0 && !decided;
    const warn = early ? `\n\n⚠️ Con ${Math.abs(up)} arriba y ${remaining} por jugar todavía no está definido.` : "";
    if (!confirm(`¿Cerrar el partido?\n\n${summary}${warn}\n\nEl punto pasa a la Copa.`)) return;
    run(() => finishMatch(m.id, up, aId, bId, thru || null), "✓ Partido cerrado");
  }

  return (
    <div className="card">
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "12px 14px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>🦆 {m.sideA.map((p) => shortName(p.full_name)).join(" / ")}</div>
        <div className={`live-pill ${st.cls}`}>{st.txt}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.sideB.map((p) => shortName(p.full_name)).join(" / ")} 🇮🇹</div>
      </div>
      {editable && (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: "10px 14px" }}>
          {!open ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="mini-btn" onClick={openEditor}>✍️ {m.status === "final" ? "Corregir resultado" : "Cargar cómo va"}</button>
              {ok && <span className="save-msg ok" style={{ marginTop: 0, fontSize: 12.5 }}>{ok}</span>}
            </div>
          ) : (
            <>
              <div className="eyebrow" style={{ marginBottom: 6 }}>¿Quién va arriba?</div>
              <div className="live-lead">
                <button className={lead === "A" ? "on pato" : ""} onClick={() => setLead("A")}>🦆 Pato</button>
                <button className={lead === "H" ? "on h" : ""} onClick={() => setLead("H")}>Empatados</button>
                <button className={lead === "B" ? "on tano" : ""} onClick={() => setLead("B")}>🇮🇹 Tano</button>
              </div>
              {lead !== "H" && (
                <div className="live-steppers">
                  <div><span>Hoyos arriba</span><button onClick={() => setDiff((d) => Math.max(1, d - 1))}>−</button><b className="tabular">{diff}</b><button onClick={() => setDiff((d) => Math.min(10, d + 1))}>＋</button></div>
                </div>
              )}
              <div className="live-steppers">
                <div><span>Hoyos jugados</span><button onClick={() => setThru((t) => Math.max(0, t - 1))}>−</button><b className="tabular">{thru}</b><button onClick={() => setThru((t) => Math.min(18, t + 1))}>＋</button></div>
              </div>
              {decided && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Con {Math.abs(up)} arriba y {remaining} por jugar, el partido está definido: cerralo.</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className={decided || thru === 18 ? "btn-ghost" : "btn-primary"} style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={partial}>Guardar cómo va</button>
                <button className={decided || thru === 18 ? "btn-primary" : "btn-ghost"} style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={final}>Cerrar partido</button>
              </div>
              <button className="btn-ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
              {err && <p className="save-msg err">{err}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
