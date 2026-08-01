import { useEffect, useState, useCallback } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getFixtures } from "../lib/queries_matches";
import { getRoster } from "../lib/queries";
import {
  getAssignments, addVehicle, deleteVehicle, joinVehicle, leaveVehicle,
  type VehicleWithSeats, type Direction,
} from "../lib/vans";
import type { Fixture, Player } from "../lib/types";
import { initials, shortName, Spinner } from "../ui/misc";

export function Camionetas() {
  const nav = useNav();
  const { edition } = useAppData();
  const { player } = useAuth();
  const isAdmin = !!player?.is_admin;

  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [dir, setDir] = useState<Direction>("ida");
  const [vans, setVans] = useState<VehicleWithSeats[] | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);

  const [vName, setVName] = useState("");
  const [vPlate, setVPlate] = useState("");
  const [vCap, setVCap] = useState(5);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!edition) return;
    getFixtures(edition.id).then((fx) => {
      setFixtures(fx);
      if (fx.length) setFixtureId((id) => id || fx[0].id);
    });
    getRoster(edition.id).then((r) => setRoster(r.map((x: any) => x.players)));
  }, [edition]);

  const refresh = useCallback(() => {
    if (!edition || !fixtureId) return;
    getAssignments(edition.id, fixtureId, dir).then(setVans).catch(() => setVans([]));
  }, [edition, fixtureId, dir]);

  useEffect(() => { setVans(null); refresh(); }, [refresh]);

  if (!edition) return <Spinner />;

  const myVanId = vans?.find((v) => v.seats.some((s) => s.player_id === player?.id))?.id ?? null;

  async function join(vehicleId: string, driver = false) {
    if (!player) return;
    await joinVehicle(vehicleId, fixtureId, dir, player.id, driver);
    refresh();
  }
  async function leave() {
    if (!player) return;
    await leaveVehicle(fixtureId, dir, player.id);
    refresh();
  }
  async function assign(vehicleId: string, playerId: string) {
    await joinVehicle(vehicleId, fixtureId, dir, playerId, false);
    refresh();
  }
  async function onAddVehicle() {
    if (!vName.trim()) return;
    await addVehicle(edition!.id, vName.trim(), vPlate.trim() || null, vCap);
    setVName(""); setVPlate(""); setVCap(5); setShowAdd(false);
    refresh();
  }

  const assignedIds = new Set(vans?.flatMap((v) => v.seats.map((s) => s.player_id)) ?? []);

  return (
    <>
      <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Camionetas</h2></div>

      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>Día {f.day_no}{f.courseName ? ` · ${f.courseName}` : ""}</option>
        ))}
        {fixtures.length === 0 && <option>Sin fechas cargadas</option>}
      </select>
      <div className="segbar" style={{ marginTop: 10 }}>
        <button className={dir === "ida" ? "on" : ""} onClick={() => setDir("ida")}>Ida</button>
        <button className={dir === "vuelta" ? "on" : ""} onClick={() => setDir("vuelta")}>Vuelta</button>
      </div>

      {!vans ? <Spinner /> : (
        <>
          {vans.length === 0 && <div className="center-msg">Todavía no hay camionetas.{isAdmin ? " Agregá la primera 👇" : ""}</div>}
          {vans.map((v) => {
            const full = v.seats.length >= v.capacity;
            const iAmHere = v.id === myVanId;
            const availPlayers = roster.filter((p) => !assignedIds.has(p.id));
            return (
              <div className="van" key={v.id} style={{ marginTop: 12 }}>
                <div className="vh">
                  <i className="logo l-cart" style={{ width: 34, height: 33, color: "var(--pine)" }} />
                  <div><div className="vn">{v.name}</div><div className="vc">{v.plate ?? "—"}</div></div>
                  <span className="cap">{v.seats.length} / {v.capacity}</span>
                  {isAdmin && (
                    <button className="mini-btn danger" style={{ marginLeft: 8 }}
                      onClick={async () => { if (confirm(`¿Borrar ${v.name}?`)) { await deleteVehicle(v.id); refresh(); } }}>✕</button>
                  )}
                </div>
                {v.seats.map((s) => (
                  <div className="seat" key={s.player_id}>
                    <span className="ava" style={{ width: 28, height: 28, fontSize: 10.5, background: "var(--pine-soft)" }}>{initials(s.full_name)}</span>
                    {shortName(s.full_name)}
                    <span className="rl">{s.role === "driver" ? "🚗 Maneja" : "Atrás"}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap", alignItems: "center" }}>
                  {iAmHere ? (
                    <>
                      <button className="mini-btn" onClick={leave}>Salir</button>
                      <button className="mini-btn" onClick={() => join(v.id, true)}>🚗 Manejo yo</button>
                    </>
                  ) : !full ? (
                    <button className="mini-btn" onClick={() => join(v.id)}>Sumarme</button>
                  ) : (
                    <span className="muted">Completa</span>
                  )}
                  {isAdmin && !full && availPlayers.length > 0 && (
                    <select className="mini-btn" defaultValue="" onChange={(e) => { if (e.target.value) assign(v.id, e.target.value); }}>
                      <option value="">+ Asignar…</option>
                      {availPlayers.map((p) => <option key={p.id} value={p.id}>{shortName(p.full_name)}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}

          {isAdmin && (
            <>
              {showAdd ? (
                <div className="card pad" style={{ marginTop: 12 }}>
                  <label className="form-lbl" style={{ marginTop: 0 }}>Nombre / referencia</label>
                  <input className="field" value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Ej: Hilux blanca" />
                  <label className="form-lbl">Patente</label>
                  <input className="field" value={vPlate} onChange={(e) => setVPlate(e.target.value)} placeholder="AB 123 CD" />
                  <label className="form-lbl">Capacidad</label>
                  <input className="field" type="number" min={1} max={9} value={vCap} onChange={(e) => setVCap(Number(e.target.value))} />
                  <button className="btn-primary" onClick={onAddVehicle}>Agregar camioneta</button>
                  <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancelar</button>
                </div>
              ) : (
                <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>＋ Agregar camioneta</button>
              )}
            </>
          )}
        </>
      )}
      <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
        Cada uno se suma a su camioneta para la ida y la vuelta de cada día. El que maneja toca “Manejo yo”.
      </p>
    </>
  );
}
