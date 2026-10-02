import { useEffect, useRef, useState, useCallback } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { supabase } from "../lib/supabase";
import { getFixtures, withTimeout } from "../lib/queries_matches";
import { getMatchesForFixture, saveLive, finishMatch, matchMargin, setMatchHole, holesState, type HoleWinner, type LiveMatch } from "../lib/liveMatches";
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
            <MatchCard key={m.id} m={m} editable={canEdit(m)} isAdmin={!!player?.is_admin} teamAId={teamAId} teamBId={teamBId} onSaved={refresh} />
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

const sideNames = (m: LiveMatch, s: "A" | "B") => (s === "A" ? m.sideA : m.sideB).map((p) => shortName(p.full_name)).join(" / ");

function MatchCard({ m, editable, isAdmin, teamAId, teamBId, onSaved }: { m: LiveMatch; editable: boolean; isAdmin: boolean; teamAId: string; teamBId: string; onSaved: () => void }) {
  const st = statusText(m);
  const [mode, setMode] = useState<"closed" | "holes" | "manual">("closed");
  return (
    <div className="card">
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "12px 14px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>🦆 {sideNames(m, "A")}</div>
        <div className={`live-pill ${st.cls}`}>{st.txt}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{sideNames(m, "B")} 🇮🇹</div>
      </div>
      {Object.keys(m.holes).length > 0 && mode !== "holes" && <HoleStrip holes={m.holes} />}
      {editable && (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: "10px 14px" }}>
          {mode === "closed" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button className="mini-btn primary" onClick={() => setMode("holes")}>⛳ Cargar hoyo a hoyo</button>
              {isAdmin && <button className="mini-btn" onClick={() => setMode("manual")}>Resultado a mano</button>}
            </div>
          )}
          {mode === "holes" && <HoleEditor m={m} onSaved={onSaved} onClose={() => setMode("closed")} />}
          {mode === "manual" && <ManualEditor m={m} teamAId={teamAId} teamBId={teamBId} onSaved={onSaved} onClose={() => setMode("closed")} />}
        </div>
      )}
    </div>
  );
}

/** Tira de 18 casilleros: de qué color quedó cada hoyo. */
function HoleStrip({ holes, sel, onPick }: { holes: Record<number, HoleWinner>; sel?: number; onPick?: (h: number) => void }) {
  return (
    <div className="hole-strip">
      {[0, 9].map((off) => (
        <div className="hs-row" key={off}>
          {Array.from({ length: 9 }, (_, i) => off + i + 1).map((h) => {
            const w = holes[h];
            const cls = w === "A" ? "pato" : w === "B" ? "tano" : w === "H" ? "h" : "";
            return (
              <button key={h} type="button" className={`hs ${cls} ${sel === h ? "sel" : ""}`} disabled={!onPick}
                onClick={() => onPick?.(h)} aria-label={`Hoyo ${h}`}>
                <span className="n">{h}</span><span className="w">{w === "A" ? "P" : w === "B" ? "T" : w === "H" ? "=" : ""}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Carga rápida: un toque por hoyo (quién lo ganó). El partido se cierra solo cuando queda definido. */
function HoleEditor({ m, onSaved, onClose }: { m: LiveMatch; onSaved: () => void; onClose: () => void }) {
  const [holes, setHoles] = useState<Record<number, HoleWinner>>(m.holes);
  const firstEmpty = (hs: Record<number, HoleWinner>) => { for (let h = 1; h <= 18; h++) if (!hs[h]) return h; return 18; };
  const [sel, setSel] = useState(() => firstEmpty(m.holes));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = useRef(0);

  // Si otro del partido carga un hoyo, traer lo nuevo (salvo mientras guardo uno).
  useEffect(() => { if (pending.current === 0) setHoles(m.holes); }, [JSON.stringify(m.holes)]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = holesState(holes);
  const singles = m.modality === "individual";
  const label = (side: "A" | "B") => (singles ? sideNames(m, side) : side === "A" ? "Pato" : "Tano");

  async function put(w: HoleWinner | null) {
    const hole = sel;
    const prev = holes;
    const next = { ...holes };
    if (w) next[hole] = w; else delete next[hole];
    setHoles(next); setErr(null); setBusy(true); pending.current++;
    try {
      await withTimeout(setMatchHole(m.id, hole, w), 15000);
      if (w) {
        // pasar al próximo hoyo sin cargar (si el partido no terminó)
        const st = holesState(next);
        if (!st.decided) setSel(firstEmpty(next));
      }
      onSaved();
    } catch (e) {
      setHoles(prev);
      setErr(errText(e, `No se guardó el hoyo ${hole}`));
    } finally { pending.current--; setBusy(false); }
  }

  const status = s.played === 0
    ? "Todavía sin hoyos cargados"
    : s.decided
      ? (s.winner === "H" ? "Terminó empatado (AS) · ½ punto cada uno" : `Terminó: gana ${label(s.winner as "A" | "B")} ${s.margin}`)
      : s.up === 0 ? `Empatados · ${s.played} hoyo${s.played > 1 ? "s" : ""} jugado${s.played > 1 ? "s" : ""}`
        : `${label(s.up > 0 ? "A" : "B")} ${Math.abs(s.up)} arriba · faltan ${s.remaining}`;
  const blocked = s.decided && !holes[sel]; // partido terminado: solo se pueden corregir hoyos ya cargados

  return (
    <>
      <div className={`hole-status ${s.decided ? "done" : ""}`}>{status}</div>
      <div className="hole-nav">
        <button className="mini-btn" disabled={sel <= 1} onClick={() => setSel((h) => Math.max(1, h - 1))} aria-label="Hoyo anterior">‹</button>
        <div className="hn-big">Hoyo <b>{sel}</b>{holes[sel] && <span className="muted"> · cargado</span>}</div>
        <button className="mini-btn" disabled={sel >= 18} onClick={() => setSel((h) => Math.min(18, h + 1))} aria-label="Hoyo siguiente">›</button>
      </div>
      {blocked ? (
        <p className="muted" style={{ textAlign: "center", fontSize: 12.5, margin: "8px 0" }}>El partido ya terminó. Para corregir, tocá un hoyo cargado.</p>
      ) : (
        <div className="hole-pick">
          <button className={`hp-btn pato ${holes[sel] === "A" ? "on" : ""}`} disabled={busy} onClick={() => put("A")}>
            <span className="t">🦆 {label("A")}</span>{!singles && <span className="s">{sideNames(m, "A")}</span>}
          </button>
          <button className={`hp-btn h ${holes[sel] === "H" ? "on" : ""}`} disabled={busy} onClick={() => put("H")}>
            <span className="t">Empate</span><span className="s">hoyo partido</span>
          </button>
          <button className={`hp-btn tano ${holes[sel] === "B" ? "on" : ""}`} disabled={busy} onClick={() => put("B")}>
            <span className="t">🇮🇹 {label("B")}</span>{!singles && <span className="s">{sideNames(m, "B")}</span>}
          </button>
        </div>
      )}
      <HoleStrip holes={holes} sel={sel} onPick={setSel} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {holes[sel] && <button className="btn-ghost" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={() => put(null)}>Borrar hoyo {sel}</button>}
        <button className="btn-ghost" style={{ marginTop: 0, flex: 1 }} onClick={onClose}>Listo</button>
      </div>
      {err && <p className="save-msg err">{err}</p>}
    </>
  );
}

/** Carga a mano (para admins): cómo va o resultado final, sin hoyos. */
function ManualEditor({ m, teamAId, teamBId, onSaved, onClose }: { m: LiveMatch; teamAId: string; teamBId: string; onSaved: () => void; onClose: () => void }) {
  const init = m.up ?? 0;
  const [lead, setLead] = useState<Lead>(init > 0 ? "A" : init < 0 ? "B" : "H");
  const [diff, setDiff] = useState(Math.abs(init) || 1);
  const [thru, setThru] = useState(m.thru ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const up = lead === "H" ? 0 : lead === "A" ? diff : -diff;
  const remaining = thru > 0 ? 18 - thru : 18;
  const decided = up !== 0 && Math.abs(up) > remaining;
  const summary = up === 0 ? "Empate (½ punto cada uno)" : `Gana ${up > 0 ? "Pato" : "Tano"} ${matchMargin(up, thru || null)}`;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(null);
    try { await withTimeout(fn(), 15000); onSaved(); onClose(); }
    catch (e) { setErr(errText(e, "No se pudo guardar")); }
    finally { setBusy(false); }
  }
  function partial() {
    if (m.status === "final" && !confirm("Este partido ya estaba cerrado. ¿Reabrirlo como 'en juego'?")) return;
    run(() => saveLive(m.id, up, thru || null));
  }
  function final() {
    const aId = m.teamAId ?? teamAId, bId = m.teamBId ?? teamBId;
    if (!aId || !bId) { setErr("No se pudo identificar a los equipos del partido. Actualizá y probá de nuevo."); return; }
    const early = thru > 0 && thru < 18 && up !== 0 && !decided;
    const warn = early ? `\n\n⚠️ Con ${Math.abs(up)} arriba y ${remaining} por jugar todavía no está definido.` : "";
    if (!confirm(`¿Cerrar el partido?\n\n${summary}${warn}\n\nEl punto pasa a la Copa.`)) return;
    run(() => finishMatch(m.id, up, aId, bId, thru || null));
  }

  return (
    <>
      {Object.keys(m.holes).length > 0 && <p className="note warn" style={{ marginTop: 0 }}><span>⚠️</span><span>Este partido tiene hoyos cargados: si después alguien carga otro hoyo, el resultado se vuelve a calcular con los hoyos.</span></p>}
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
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn-ghost" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={partial}>Guardar cómo va</button>
        <button className="btn-primary" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={final}>Cerrar partido</button>
      </div>
      <button className="btn-ghost" style={{ marginTop: 8 }} disabled={busy} onClick={onClose}>Cancelar</button>
      {err && <p className="save-msg err">{err}</p>}
    </>
  );
}
