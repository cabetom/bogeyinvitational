import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getFixtures, saveHoleByHole, upsertScorecardTotal } from "../lib/queries_matches";
import { getCourseHoles, type HoleRow } from "../lib/adminSetup";
import { holeStablefordPoints, roundStableford } from "../lib/scoring";
import type { Fixture } from "../lib/types";

export function Cargar() {
  const { edition, reload } = useAppData();
  const { player } = useAuth();
  const nav = useNav();
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [holes, setHoles] = useState<HoleRow[] | null>(null);
  const [handicap, setHandicap] = useState(18);
  const [gross, setGross] = useState<Record<number, number>>({});
  const [total, setTotal] = useState(36); // fallback modo total
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!edition) return;
    getFixtures(edition.id).then((fx) => {
      setFixtures(fx);
      if (fx.length) setFixtureId((id) => id || fx[fx.length - 1].id);
    });
  }, [edition]);

  const fixture = fixtures.find((f) => f.id === fixtureId);

  useEffect(() => {
    setGross({});
    if (!fixture?.course_id) { setHoles([]); return; }
    setHoles(null);
    getCourseHoles(fixture.course_id).then(setHoles).catch(() => setHoles([]));
  }, [fixture?.course_id]);

  const byHole = holes && holes.length === 18;

  const netTotal = useMemo(() => {
    if (!byHole || !holes) return 0;
    return roundStableford(gross, holes, handicap);
  }, [byHole, holes, gross, handicap]);

  const holesPlayed = useMemo(() => Object.values(gross).filter((v) => v > 0).length, [gross]);

  if (!player) {
    return <div className="center-msg">Tu usuario todavía no está vinculado a un jugador del torneo. Pedile a un admin que te agregue con tu Gmail.</div>;
  }

  async function save() {
    if (!fixtureId || !player) return;
    setBusy(true);
    setMsg(null);
    try {
      if (byHole) {
        await saveHoleByHole(fixtureId, player.id, handicap, gross, netTotal, player.id);
        setMsg(`✓ Guardado · ${netTotal} pts netos`);
      } else {
        await upsertScorecardTotal(fixtureId, player.id, total, player.id, handicap);
        setMsg(`✓ Guardado · ${total} pts`);
      }
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

      <label className="form-lbl">Fecha</label>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>Día {f.day_no}{f.courseName ? ` · ${f.courseName}` : ""}</option>
        ))}
        {fixtures.length === 0 && <option>Sin fechas cargadas</option>}
      </select>

      <label className="form-lbl">Tu hándicap del día</label>
      <input className="field tabular" type="number" min={0} max={54} value={handicap}
        onChange={(e) => setHandicap(Number(e.target.value))} />

      {holes === null ? (
        <p className="muted" style={{ marginTop: 14 }}>Cargando cancha…</p>
      ) : byHole ? (
        <>
          <div className="sec-title"><h2>Hoyo por hoyo</h2><span className="muted tabular">{holesPlayed}/18</span></div>
          <div className="holes-grid">
            {holes!.map((h) => {
              const g = gross[h.hole_no];
              const pts = g ? holeStablefordPoints(g, h, handicap) : null;
              return (
                <div className="hole" key={h.hole_no}>
                  <div className="hn">H{h.hole_no}<span>par {h.par}</span></div>
                  <input className="hin tabular" type="number" min={1} max={15} inputMode="numeric"
                    value={g ?? ""} onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      setGross((prev) => { const n = { ...prev }; if (v > 0) n[h.hole_no] = v; else delete n[h.hole_no]; return n; });
                    }} />
                  <div className={`hp ${pts != null && pts >= 2 ? "good" : ""}`}>{pts != null ? `${pts}p` : "—"}</div>
                </div>
              );
            })}
          </div>
          <div className="net-total">
            <span>Stableford neto</span>
            <b className="tabular">{netTotal}</b>
          </div>
        </>
      ) : (
        <>
          <div className="note">
            <span>ℹ️</span>
            <span>Esta cancha todavía no tiene los pares cargados, así que cargás el <b>total</b>. Cuando un admin cargue los hoyos, vas a poder cargar hoyo por hoyo y el neto se calcula solo.</span>
          </div>
          <label className="form-lbl">Tus puntos Stableford (total)</label>
          <div className="stepper-row">
            <button onClick={() => setTotal((p) => Math.max(0, p - 1))} aria-label="Menos">−</button>
            <div className="tabular"><b>{total}</b> pts</div>
            <button onClick={() => setTotal((p) => Math.min(60, p + 1))} aria-label="Más">＋</button>
          </div>
        </>
      )}

      <button className="btn-primary" disabled={busy || !fixtureId} onClick={save}>
        {busy ? "Guardando…" : "Guardar tarjeta"}
      </button>
      {msg && <p style={{ textAlign: "center", marginTop: 12, fontWeight: 600, color: "var(--pine)" }}>{msg}</p>}
    </>
  );
}
