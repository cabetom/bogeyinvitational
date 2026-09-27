import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { supabase } from "../lib/supabase";
import { getRoster } from "../lib/queries";
import { getFixtures, getScorecard, saveScorecard, withTimeout, type SavedCard } from "../lib/queries_matches";
import { getCourseHoles, type HoleRow } from "../lib/adminSetup";
import { fmtHcp, holeStablefordPoints, parseHcp, roundStableford, strokesReceived } from "../lib/scoring";
import { fixtureLabel, fmtDay, fmtTee, pickDefaultFixture, todayAR } from "../lib/dates";
import { cacheGet, cacheSet } from "../lib/cache";
import { errMsg, isNetworkError } from "../lib/errors";
import type { Fixture, Player } from "../lib/types";
import { displayName, PlayerStatusMsg, Spinner } from "../ui/misc";

type FixtureRow = Fixture & { courseName: string | null };
interface RosterRow { player_id: string; team_id: string | null; handicap: number | null; players: Player }
interface Draft { gross: Record<number, number>; hcp: string; total: string; ts: number }

const draftKey = (fx: string, pl: string) => `bogey-draft:${fx}:${pl}`;
function readDraft(fx: string, pl: string): Draft | null {
  try { const s = localStorage.getItem(draftKey(fx, pl)); return s ? (JSON.parse(s) as Draft) : null; } catch { return null; }
}
function writeDraft(fx: string, pl: string, d: Draft) {
  try { localStorage.setItem(draftKey(fx, pl), JSON.stringify(d)); } catch { /* ignore */ }
}
function clearDraft(fx: string, pl: string) {
  try { localStorage.removeItem(draftKey(fx, pl)); } catch { /* ignore */ }
}

// Los guardados van en fila: uno nuevo sale recién cuando terminó (o se colgó) el anterior.
let saveChain: Promise<unknown> = Promise.resolve();
function queueSave(fn: () => Promise<void>): Promise<void> {
  const prev = saveChain.catch(() => {});
  const run = Promise.race([prev, new Promise((r) => setTimeout(r, 25000))]).then(fn);
  saveChain = run.catch(() => {});
  return run;
}

export function Cargar() {
  const { currentEdition: ed, edition, isCurrent, version } = useAppData();
  const { player, playerStatus } = useAuth();

  const [fixtures, setFixtures] = useState<FixtureRow[] | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [baseOffline, setBaseOffline] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [fixtureId, setFixtureId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [cardsOf, setCardsOf] = useState<Set<string> | null>(null); // fechas con tarjeta del jugador elegido

  // Fechas y plantel de la edición ACTUAL (no la que se mira en el header). Sin señal: copia local.
  const loadBase = useCallback(() => {
    if (!ed) return;
    setLoadErr(false);
    const apply = (fx: FixtureRow[], r: RosterRow[]) => {
      setFixtures(fx);
      setRoster(r.slice().sort((a, b) => (a.team_id ?? "").localeCompare(b.team_id ?? "") || a.players.full_name.localeCompare(b.players.full_name)));
      setFixtureId((id) => id || pickDefaultFixture(fx)?.id || "");
    };
    withTimeout(Promise.all([getFixtures(ed.id), getRoster(ed.id)]), 12000)
      .then(([fx, r]) => {
        cacheSet(`base:${ed.id}`, { fx, r });
        setBaseOffline(false);
        apply(fx, r as unknown as RosterRow[]);
      })
      .catch(() => {
        const c = cacheGet<{ fx: FixtureRow[]; r: RosterRow[] }>(`base:${ed.id}`);
        if (c) { setBaseOffline(true); apply(c.fx, c.r); } else setLoadErr(true);
      });
  }, [ed?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadBase(); }, [loadBase]);

  // Jugador por defecto: yo, si estoy en el plantel.
  useEffect(() => {
    if (!roster || !player) return;
    setPlayerId((id) => id || (roster.some((r) => r.player_id === player.id) ? player.id : ""));
  }, [roster, player]);

  // Qué fechas ya tiene cargadas el jugador elegido (para avisar si falta una anterior).
  useEffect(() => {
    if (!ed || !playerId) return;
    let alive = true;
    supabase.from("scorecards").select("fixture_id, fixtures!inner(edition_id)").eq("player_id", playerId).eq("fixtures.edition_id", ed.id)
      .then(({ data, error }) => { if (alive && !error) setCardsOf(new Set((data ?? []).map((c: any) => c.fixture_id))); });
    return () => { alive = false; };
  }, [ed?.id, playerId, version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!player) return <PlayerStatusMsg status={playerStatus} />;
  if (!ed) return <Spinner />;
  if (loadErr) {
    return (
      <div className="center-msg">
        No se pudieron cargar las fechas (¿sin señal?).
        <button className="btn-primary" onClick={loadBase}>Reintentar</button>
      </div>
    );
  }
  if (!fixtures || !roster) return <Spinner />;

  const inRoster = roster.some((r) => r.player_id === player.id);
  if (!inRoster && !player.is_admin) {
    return <div className="center-msg">No estás en el plantel {ed.year}. Pedile a un admin que te agregue.</div>;
  }

  const fixture = fixtures.find((f) => f.id === fixtureId);
  const target = roster.find((r) => r.player_id === playerId) ?? null;
  const today = todayAR();
  const missing = fixture && cardsOf
    ? fixtures.filter((f) => f.day_no < fixture.day_no && (f.date == null || f.date <= today) && !cardsOf.has(f.id))
    : [];
  const isMe = target?.player_id === player.id;

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}>
        <h2>{target && !isMe ? `Tarjeta de ${displayName(target.players.full_name)}` : "Cargar tu tarjeta"}</h2>
        <span className="muted">Edición {ed.year}</span>
      </div>
      {!isCurrent && edition && (
        <div className="note"><span>ℹ️</span><span>Arriba estás mirando {edition.year}, pero las tarjetas se cargan en la edición {ed.year}.</span></div>
      )}
      {baseOffline && (
        <div className="note warn"><span>📶</span><span>Sin señal: podés cargar igual. Se guarda en el celu y lo mandás cuando vuelva la señal. <button className="link" onClick={loadBase}>Reintentar</button></span></div>
      )}

      <label className="form-lbl">Fecha</label>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}{f.tee_time ? ` · ${fmtTee(f.tee_time)}` : ""}</option>)}
        {fixtures.length === 0 && <option value="">Sin fechas cargadas</option>}
      </select>

      <label className="form-lbl">Jugador</label>
      <select className="field" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
        {!playerId && <option value="">— Elegí de quién es la tarjeta —</option>}
        {roster.map((r) => (
          <option key={r.player_id} value={r.player_id}>
            {r.player_id === player.id ? `Yo · ${displayName(r.players.full_name)}` : displayName(r.players.full_name)}
          </option>
        ))}
      </select>

      {missing.length > 0 && (
        <div className="note warn">
          <span>⚠️</span>
          <span>
            {isMe ? "Te falta" : "Falta"} la tarjeta del {missing.map((f) => `Día ${f.day_no}${f.date ? ` (${fmtDay(f.date)})` : ""}`).join(", ")}.{" "}
            <button className="link" onClick={() => setFixtureId(missing[0].id)}>Cargar Día {missing[0].day_no}</button>
          </span>
        </div>
      )}

      {fixture && target && (
        <CardEditor
          key={`${fixture.id}:${target.player_id}`}
          fixture={fixture}
          target={target}
          me={player}
          onSaved={() => setCardsOf((s) => new Set([...(s ?? []), fixture.id]))}
        />
      )}
    </>
  );
}

/** Una tarjeta (fecha + jugador). Se monta de nuevo al cambiar cualquiera de los dos: el estado nunca se mezcla entre tarjetas. */
function CardEditor({ fixture, target, me, onSaved }: { fixture: FixtureRow; target: RosterRow; me: Player; onSaved: () => void }) {
  const { reload } = useAppData();
  const nav = useNav();
  const [holes, setHoles] = useState<HoleRow[] | null>(null);
  const [saved, setSaved] = useState<SavedCard | null | undefined>(undefined); // undefined = cargando
  const [cardErr, setCardErr] = useState(false);
  const [blind, setBlind] = useState(false); // seguir sin poder ver lo guardado (sin señal)
  const [hcp, setHcp] = useState("");
  const [gross, setGross] = useState<Record<number, number>>({});
  const [total, setTotal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [hadDraft, setHadDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const fx = fixture.id, pl = target.player_id;

  function applyInitial(card: SavedCard | null) {
    const draft = readDraft(fx, pl);
    if (draft && (!card || (draft.ts ?? 0) > card.updatedAt)) {
      setGross(draft.gross ?? {}); setHcp(draft.hcp ?? ""); setTotal(draft.total ?? "");
      setDirty(true); setHadDraft(true);
      return;
    }
    if (draft) clearDraft(fx, pl); // el servidor tiene una versión más nueva
    const baseHcp = card?.handicap ?? target.handicap ?? null;
    setGross(card?.gross ?? {});
    setHcp(fmtHcp(baseHcp));
    setTotal(card?.stableford != null ? String(card.stableford) : "");
    setDirty(false); setHadDraft(false);
  }

  const load = useCallback(() => {
    setCardErr(false); setSaved(undefined);
    const cid = fixture.course_id;
    const holesP: Promise<HoleRow[]> = cid
      ? withTimeout(getCourseHoles(cid), 12000)
          .then((h) => { cacheSet(`holes:${cid}`, h); return h; })
          .catch(() => { const c = cacheGet<HoleRow[]>(`holes:${cid}`); if (c) return c; throw new Error("sin hoyos"); })
      : Promise.resolve([]);
    Promise.all([holesP, withTimeout(getScorecard(fx, pl), 12000)])
      .then(([h, card]) => { setHoles(h); setSaved(card); applyInitial(card); })
      .catch(() => {
        holesP.then(setHoles).catch(() => setHoles(null));
        setCardErr(true);
      });
  }, [fx, pl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  function goBlind() {
    setBlind(true); setCardErr(false); setSaved(null);
    if (!holes) setHoles([]);
    applyInitial(null);
  }

  // Cada cambio queda guardado en el celu (por si se cierra la app o se va la señal).
  useEffect(() => {
    if (dirty) writeDraft(fx, pl, { gross, hcp, total, ts: Date.now() });
  }, [dirty, gross, hcp, total, fx, pl]);

  const byHole = !!holes && holes.length === 18;
  const hcpNum = parseHcp(hcp);
  const netTotal = useMemo(() => (byHole && hcpNum != null ? roundStableford(gross, holes!, hcpNum) : 0), [byHole, holes, gross, hcpNum]);
  const holesPlayed = Object.values(gross).filter((v) => v > 0).length;
  const grossSum = (from: number, to: number) => Object.entries(gross).reduce((s, [h, v]) => (Number(h) >= from && Number(h) <= to ? s + v : s), 0);
  const name = displayName(target.players.full_name);
  const isMe = pl === me.id;

  if (cardErr && !blind) {
    return (
      <div className="center-msg">
        No se pudo abrir la tarjeta (¿sin señal?).
        <button className="btn-primary" onClick={load}>Reintentar</button>
        {(holes || fixture.course_id == null) && (
          <button className="btn-ghost" onClick={goBlind}>Cargar igual sin señal</button>
        )}
      </div>
    );
  }
  if (saved === undefined && !blind) return <Spinner />;

  function setHole(holeNo: number, idx: number, raw: string) {
    let d = raw.replace(/\D/g, "");
    // si el celu no seleccionó el número anterior, quedarse con lo último que se tocó
    if (d.length > 2 || Number(d) > 15) d = d.slice(-1);
    const v = d === "" ? 0 : Number(d);
    setGross((prev) => { const n = { ...prev }; if (v > 0) n[holeNo] = v; else delete n[holeNo]; return n; });
    setDirty(true); setMsg(null);
    // pasar solo al siguiente hoyo (un "1" puede ser un 10+)
    if (v >= 2 && d.length === 1) inputs.current[idx + 1]?.focus();
  }

  function discardDraft() {
    if (!confirm("¿Descartar lo que cargaste y volver a lo guardado?")) return;
    clearDraft(fx, pl);
    load();
  }

  async function save() {
    if (busy) return;
    if (byHole) {
      if (hcpNum == null || hcpNum < -10 || hcpNum > 54) { setMsg({ ok: false, text: "Cargá el hándicap del día (entre 0 y 54)." }); return; }
      if (holesPlayed === 0) { setMsg({ ok: false, text: "No cargaste ningún hoyo." }); return; }
      if (holesPlayed < 18 && !confirm(`Cargaste ${holesPlayed} de 18 hoyos. Los hoyos vacíos cuentan 0 puntos (podés completarlos después). ¿Guardar igual?`)) return;
    } else {
      const t = Number(total);
      if (total.trim() === "" || !Number.isInteger(t) || t < 0 || t > 60) { setMsg({ ok: false, text: "Cargá los puntos stableford netos (0 a 60)." }); return; }
    }
    if (!isMe && !confirm(`Vas a guardar la tarjeta de ${name}${saved ? " (reemplaza la que ya estaba)" : ""}. ¿Seguro?`)) return;

    const pts = byHole ? netTotal : Number(total);
    const snapshot = { gross: { ...gross }, hcp: hcpNum };
    setBusy(true); setMsg(null);
    try {
      await withTimeout(queueSave(() => saveScorecard({
        fixtureId: fx, playerId: pl, handicap: snapshot.hcp, stableford: pts,
        mode: byHole ? "hole_by_hole" : "total", submittedBy: me.id, gross: snapshot.gross,
      })), 20000);
      clearDraft(fx, pl);
      setDirty(false); setHadDraft(false); setBlind(false);
      setSaved({ id: saved?.id ?? "", stableford: pts, handicap: snapshot.hcp, entry_mode: byHole ? "hole_by_hole" : "total", submittedByName: me.full_name, gross: snapshot.gross, updatedAt: Date.now() });
      setMsg({ ok: true, text: `✓ Tarjeta guardada · ${pts} pts netos` });
      onSaved();
      reload();
    } catch (e) {
      setMsg({
        ok: false,
        text: isNetworkError(e)
          ? "No se pudo guardar: no hay señal. Lo que cargaste quedó guardado en el celu — tocá Guardar de nuevo cuando tengas señal."
          : `No se pudo guardar: ${errMsg(e) || "error desconocido"}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {blind && (
        <div className="note warn"><span>📶</span><span>Sin señal no pude ver si esta tarjeta ya estaba cargada. Si la guardás, reemplaza la anterior.</span></div>
      )}
      {hadDraft && dirty && (
        <div className="note warn">
          <span>✏️</span>
          <span>Tenés cambios sin guardar en este celu. <button className="link" onClick={discardDraft}>Descartar</button></span>
        </div>
      )}
      {saved && !dirty && (
        <div className="note ok">
          <span>✓</span>
          <span>Ya guardada · <b>{saved.stableford ?? "—"} pts</b>{saved.submittedByName ? ` · la cargó ${displayName(saved.submittedByName)}` : ""}. Si corregís algo, tocá Guardar.</span>
        </div>
      )}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="form-lbl">Hándicap de juego del día</label>
        <input className="field tabular" inputMode="decimal" value={hcp} placeholder="Ej: 14"
          onChange={(e) => { setHcp(e.target.value.replace(/[^\d.,+-]/g, "")); setDirty(true); setMsg(null); }} />
        {target.handicap != null && hcpNum !== target.handicap && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>El hándicap cargado por el admin es {fmtHcp(target.handicap)}.</p>
        )}

        {byHole ? (
          <>
            <div className="sec-title"><h2>Hoyo por hoyo</h2><span className="muted tabular">{holesPlayed}/18 hoyos</span></div>
            <div className="holes-grid">
              {holes!.map((h, idx) => {
                const g = gross[h.hole_no];
                const pts = g && hcpNum != null ? holeStablefordPoints(g, h, hcpNum) : null;
                const recv = hcpNum != null ? strokesReceived(hcpNum, h.stroke_index) : 0;
                return (
                  <div className="hole" key={h.hole_no}>
                    <div className="hn">
                      H{h.hole_no}{recv > 0 && <i className="recv" title={`Recibís ${recv} golpe${recv > 1 ? "s" : ""}`}>{"•".repeat(Math.min(recv, 3))}</i>}
                      <span>par {h.par}</span><span>hcp {h.stroke_index}</span>
                    </div>
                    <input
                      ref={(el) => { inputs.current[idx] = el; }}
                      className="hin tabular" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off"
                      aria-label={`Golpes hoyo ${h.hole_no}`}
                      value={g ?? ""} onChange={(e) => setHole(h.hole_no, idx, e.target.value)}
                      onFocus={(e) => e.target.select()}
                    />
                    <div className={`hp ${pts != null && pts >= 2 ? "good" : ""}`}>{pts != null ? `${pts}p` : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div className="gross-sum tabular">
              <span>Ida <b>{grossSum(1, 9) || "—"}</b></span>
              <span>Vuelta <b>{grossSum(10, 18) || "—"}</b></span>
              <span>Golpes <b>{grossSum(1, 18) || "—"}</b></span>
            </div>
            <div className="net-total">
              <span>Stableford neto</span>
              <b className="tabular">{hcpNum == null ? "—" : netTotal}</b>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              Los puntitos (•) marcan los hoyos donde recibís golpe. Hoyo vacío = levantaste (0 puntos).
            </p>
          </>
        ) : (
          <>
            <div className="note">
              <span>ℹ️</span>
              <span>{holes === null ? "Sin señal no pude traer los hoyos de la cancha" : "Esta cancha no tiene los pares cargados"}: cargá el <b>total de puntos stableford netos</b>.</span>
            </div>
            <label className="form-lbl">Puntos stableford netos del día</label>
            <input className="field tabular" inputMode="numeric" pattern="[0-9]*" value={total} placeholder="Ej: 34"
              onChange={(e) => { setTotal(e.target.value.replace(/\D/g, "").slice(0, 2)); setDirty(true); setMsg(null); }} />
          </>
        )}
      </fieldset>

      <button className="btn-primary" disabled={busy} onClick={save}>
        {busy ? "Guardando…" : saved ? "Guardar cambios" : "Guardar tarjeta"}
      </button>
      {msg && <p className={`save-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      {msg?.ok && <button className="btn-ghost" onClick={() => nav("ranking")}>Ver el ranking</button>}
    </>
  );
}
