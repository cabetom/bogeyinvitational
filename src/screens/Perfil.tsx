import { useEffect, useRef, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getPlayerHistory, type HistoryRow } from "../lib/queries_matches";
import { uploadAvatar } from "../lib/storage";
import { requestNotify, notifyPermission } from "../lib/notify";
import { Avatar, displayName, shortName, Spinner } from "../ui/misc";

export function Perfil() {
  const nav = useNav();
  const { player, signOut, refreshPlayer } = useAuth();
  const { edition, ranking, records, reload } = useAppData();
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notif, setNotif] = useState(notifyPermission());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!player || !edition) return;
    getPlayerHistory(player.id, edition.id).then(setHistory).catch(() => setHistory([]));
  }, [player, edition]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !player) return;
    setUploading(true);
    try {
      await uploadAvatar(player.id, file);
      await refreshPlayer();
      reload();
    } catch (err) {
      alert("No se pudo subir la foto: " + (err instanceof Error ? err.message : ""));
    } finally {
      setUploading(false);
    }
  }

  async function toggleNotif() {
    const p = await requestNotify();
    setNotif(p);
    if (p !== "granted") alert("Activá las notificaciones en los permisos del navegador para recibir avisos.");
  }

  if (!player) return <div className="center-msg">No hay jugador vinculado a tu usuario.</div>;

  const row = ranking.find((r) => r.player.id === player.id);
  const rec = records.find((r) => r.player.id === player.id);
  const team = row?.team ?? null;

  return (
    <>
      <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "8px 0 4px" }}>
        <button className="avatar-edit" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Cambiar foto">
          <Avatar player={player} team={team} size={88} />
          <span className="cam">{uploading ? "…" : "📷"}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, marginTop: 12 }}>{displayName(player.full_name)}</h3>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {team && <span className={`chip ${team.name.toLowerCase()}`}>Equipo {team.name}</span>}
          {player.is_admin && <span className="chip admin">🛡️ Admin</span>}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="stat"><div className="n tabular">{row?.points ?? 0}</div><div className="k">Stableford {edition?.year ?? ""}</div></div>
        <div className="stat"><div className="n tabular">{rec ? `${rec.wins}–${rec.losses}` : "–"}</div><div className="k">Récord de matches</div></div>
      </div>

      <div className="sec-title"><h2>Historial de partidos</h2></div>
      {!history ? <Spinner /> : (
        <div className="card pad">
          {history.filter((h) => h.result !== null || h.stableford !== null).map((h) => (
            <div key={h.fixtureId} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 4px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flex: "0 0 auto", background: h.won == null ? "var(--ink-faint)" : h.won ? "var(--win)" : "var(--loss)" }}>
                {h.won == null ? "–" : h.won ? "G" : "P"}
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                  Día {h.dayNo}{h.modality === "individual" ? " · Individual" : h.partners.length ? ` · con ${shortName(h.partners[0])}` : ""}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 1 }}>
                  {h.courseName ?? ""}{h.opponents.length ? ` · vs ${h.opponents.map(shortName).join(" / ")}` : ""}
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right", fontFamily: "var(--serif)", fontWeight: 700, fontSize: 14 }} className="tabular">
                {h.stableford ?? "–"}<span style={{ display: "block", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-faint)", fontFamily: "var(--sans)", fontWeight: 600 }}>Stbl</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-title"><h2>Ajustes</h2></div>
      <button className="btn-ghost" style={{ marginTop: 0 }} onClick={toggleNotif}>
        {notif === "granted" ? "🔔 Notificaciones activadas" : "🔕 Activar notificaciones"}
      </button>
      <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? "Subiendo…" : "📷 Cambiar foto de perfil"}
      </button>
      <button className="btn-ghost" onClick={signOut}>Cerrar sesión</button>
    </>
  );
}
