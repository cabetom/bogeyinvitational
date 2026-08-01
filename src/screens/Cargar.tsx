import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getFixtures, upsertScorecardTotal } from "../lib/queries_matches";
import type { Fixture } from "../lib/types";

export function Cargar() {
  const { edition, reload } = useAppData();
  const { player } = useAuth();
  const nav = useNav();
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [fixtureId, setFixtureId] = useState<string>("");
  const [pts, setPts] = useState(36);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!edition) return;
    getFixtures(edition.id).then((fx) => {
      setFixtures(fx);
      if (fx.length) setFixtureId(fx[fx.length - 1].id);
    });
  }, [edition]);

  if (!player) {
    return <div className="center-msg">Tu usuario todavía no está vinculado a un jugador del torneo. Avisá a un admin.</div>;
  }

  async function save() {
    if (!fixtureId || !player) return;
    setBusy(true);
    setMsg(null);
    try {
      await upsertScorecardTotal(fixtureId, player.id, pts, player.id);
      setMsg(`✓ Tarjeta guardada · ${pts} pts`);
      reload();
      setTimeout(() => nav("ranking"), 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Cargar tu tarjeta</h2></div>
      <p className="muted" style={{ margin: "0 4px" }}>
        Cargá tu stableford del día. El resultado del match se calcula solo y no se duplica.
      </p>

      <label className="form-lbl">Fecha</label>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>
            Día {f.day_no}{f.courseName ? ` · ${f.courseName}` : ""}
          </option>
        ))}
      </select>

      <label className="form-lbl">Tus puntos Stableford</label>
      <div className="stepper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 12px" }}>
        <button className="step-btn" onClick={() => setPts((p) => Math.max(0, p - 1))} aria-label="Menos"
          style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--pine)", fontSize: 26, cursor: "pointer" }}>−</button>
        <div style={{ fontFamily: "var(--serif)", fontSize: 40, fontWeight: 700, color: "var(--pine)" }} className="tabular">
          {pts}<small style={{ fontSize: 13, color: "var(--ink-soft)", fontFamily: "var(--sans)", marginLeft: 4 }}>pts</small>
        </div>
        <button className="step-btn" onClick={() => setPts((p) => Math.min(60, p + 1))} aria-label="Más"
          style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--pine)", fontSize: 26, cursor: "pointer" }}>＋</button>
      </div>

      <div className="note">
        <span>ℹ️</span>
        <span>Por ahora se carga el <b>total</b>. La carga <b>hoyo por hoyo</b> (con handicap y resultado automático del fourball) se activa cuando carguemos el par y stroke index de cada cancha.</span>
      </div>

      <button className="btn-primary" disabled={busy || !fixtureId} onClick={save}>
        {busy ? "Guardando…" : "Guardar tarjeta"}
      </button>
      {msg && <p style={{ textAlign: "center", marginTop: 12, fontWeight: 600, color: "var(--pine)" }}>{msg}</p>}
    </>
  );
}
