import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getRoster } from "../lib/queries";
import { addPlayerToEdition, removeFromEdition, setPlayerAdmin } from "../lib/admin";
import type { Player, Team } from "../lib/types";
import { Avatar, displayName, Spinner } from "../ui/misc";

interface RosterRow {
  player_id: string;
  team_id: string | null;
  handicap: number | null;
  players: Player;
}

export function Admin() {
  const nav = useNav();
  const { player } = useAuth();
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

  useEffect(() => {
    refresh();
    if (teams[0]) setTeamId((t) => t || teams[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition, teams]);

  if (!player?.is_admin) {
    return (
      <>
        <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
        <div className="center-msg">Esta sección es solo para administradores.</div>
      </>
    );
  }

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  async function onAdd() {
    if (!edition || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await addPlayerToEdition(edition.id, name.trim(), email.trim() || null, teamId || null);
      setName("");
      setEmail("");
      setMsg("✓ Jugador agregado");
      await refresh();
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(r: RosterRow) {
    if (!edition) return;
    if (!confirm(`¿Sacar a ${displayName(r.players.full_name)} del torneo ${edition.year}?`)) return;
    await removeFromEdition(edition.id, r.player_id);
    await refresh();
    reload();
  }

  async function onToggleAdmin(r: RosterRow) {
    await setPlayerAdmin(r.player_id, !r.players.is_admin);
    await refresh();
  }

  const teamObj = (id: string | null): Team | null => teams.find((t) => t.id === id) ?? null;

  return (
    <>
      <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
      <div className="sec-title" style={{ marginTop: 2 }}>
        <h2>Jugadores · {edition?.year}</h2>
        <span className="muted">{roster?.length ?? 0}</span>
      </div>

      <div className="card pad">
        <label className="form-lbl" style={{ marginTop: 0 }}>Nombre y apellido</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" />
        <label className="form-lbl">Email (Gmail para el login)</label>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jugador@gmail.com" />
        <label className="form-lbl">Equipo</label>
        <select className="field" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="btn-primary" disabled={busy || !name.trim()} onClick={onAdd}>
          {busy ? "Agregando…" : "Agregar jugador"}
        </button>
        {msg && <p style={{ textAlign: "center", marginTop: 10, fontWeight: 600, color: "var(--pine)" }}>{msg}</p>}
      </div>

      <div className="sec-title"><h2>Plantel</h2></div>
      {!roster ? <Spinner /> : (
        <div className="card" style={{ padding: "4px 12px" }}>
          {roster.map((r) => (
            <div key={r.player_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--line-soft)" }}>
              <Avatar player={r.players} team={teamObj(r.team_id)} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                  {displayName(r.players.full_name)}
                  {r.players.is_admin && <span className="chip admin">🛡️</span>}
                </div>
                <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.players.email || "sin email — no puede entrar"} · {teamName(r.team_id)}
                </div>
              </div>
              <button className="mini-btn" onClick={() => onToggleAdmin(r)} title="Admin">
                {r.players.is_admin ? "Quitar admin" : "Hacer admin"}
              </button>
              <button className="mini-btn danger" onClick={() => onRemove(r)} title="Sacar">✕</button>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
        Agregar un jugador con su Gmail lo autoriza a entrar. Sacarlo lo quita de este torneo (no borra su historial).
      </p>
    </>
  );
}
