import { useEffect, useState, useCallback } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { supabase } from "../lib/supabase";
import { getFixtures } from "../lib/queries_matches";
import { getMatchesForFixture, saveLive, finishMatch, type LiveMatch } from "../lib/liveMatches";
import type { Fixture } from "../lib/types";
import { shortName, Spinner } from "../ui/misc";

function statusText(m: LiveMatch): { txt: string; cls: string } {
  if (m.status === "final") {
    if (m.winner === "H") return { txt: "Empatado (AS)", cls: "h" };
    const t = m.winner === "A" ? "Pato" : "Tano";
    return { txt: `Ganó ${t} ${m.up ? `${Math.abs(m.up)} up` : ""}`.trim(), cls: m.winner === "A" ? "pato" : "tano" };
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
  const { edition, teams } = useAppData();
  const { player } = useAuth();
  const teamAId = teams.find((t) => t.name === "Pato")?.id ?? "";
  const teamBId = teams.find((t) => t.name === "Tano")?.id ?? "";
  const [fixtures, setFixtures] = useState<(Fixture & { courseName: string | null })[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);

  useEffect(() => {
    if (!edition) return;
    getFixtures(edition.id).then((fx) => { setFixtures(fx); if (fx.length) setFixtureId((id) => id || fx[fx.length - 1].id); });
  }, [edition]);

  const refresh = useCallback(() => {
    if (!fixtureId) return;
    getMatchesForFixture(fixtureId).then(setMatches).catch(() => setMatches([]));
  }, [fixtureId]);

  useEffect(() => { setMatches(null); refresh(); }, [refresh]);
  // Realtime instantáneo + fallback de auto-refresh cada 20s
  useEffect(() => {
    const ch = supabase
      .channel("envivo-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results" }, () => refresh())
      .subscribe();
    const t = setInterval(refresh, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [refresh]);

  if (!edition) return <Spinner />;

  const myId = player?.id;
  const isMine = (m: LiveMatch) => !!myId && (m.sideA.some((p) => p.id === myId) || m.sideB.some((p) => p.id === myId));

  return (
    <>
      <div className="sec-title" style={{ marginTop: 2 }}>
        <h2>🔴 En vivo</h2>
        <button className="link" onClick={refresh}>↻ Actualizar</button>
      </div>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        {fixtures.map((f) => <option key={f.id} value={f.id}>Día {f.day_no}{f.courseName ? ` · ${f.courseName}` : ""}</option>)}
        {fixtures.length === 0 && <option value="">Sin fechas</option>}
      </select>

      {!matches ? <Spinner /> : matches.length === 0 ? (
        <div className="center-msg">Todavía no hay partidos cargados para este día.<br />Un admin los arma en Gestión → Partidos.</div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {matches.map((m) => (
            <MatchCard key={m.id} m={m} mine={isMine(m)} mySide={m.sideA.some((p) => p.id === myId) ? "A" : "B"} teamAId={teamAId} teamBId={teamBId} onSaved={refresh} />
          ))}
        </div>
      )}
      <p className="muted" style={{ textAlign: "center", marginTop: 14 }}>
        Se actualiza solo cada 15s. Cargá tu partido y todos lo ven al toque.
      </p>
      <button className="btn-ghost" onClick={() => nav("equipos")}>Ver la Copa (Ryder)</button>
    </>
  );
}

function MatchCard({ m, mine, mySide, teamAId, teamBId, onSaved }: { m: LiveMatch; mine: boolean; mySide: "A" | "B"; teamAId: string; teamBId: string; onSaved: () => void }) {
  const st = statusText(m);
  const [open, setOpen] = useState(false);
  // estado del editor desde la perspectiva del jugador
  const initAdv = (() => {
    const up = m.up ?? 0;
    const mineUp = mySide === "A" ? up : -up;
    return mineUp > 0 ? "up" : mineUp < 0 ? "down" : "as";
  })();
  const [adv, setAdv] = useState<"up" | "as" | "down">(initAdv);
  const [diff, setDiff] = useState(Math.abs(m.up ?? 0) || 1);
  const [thru, setThru] = useState(m.thru ?? 0);
  const [busy, setBusy] = useState(false);

  // up global (Pato +) según lo que cargó el jugador
  function globalUp(): number {
    if (adv === "as") return 0;
    const mineUp = adv === "up" ? diff : -diff;
    return mySide === "A" ? mineUp : -mineUp;
  }

  async function partial() {
    setBusy(true);
    try { await saveLive(m.id, globalUp(), thru || null); setOpen(false); onSaved(); } finally { setBusy(false); }
  }
  async function final() {
    setBusy(true);
    try { await finishMatch(m.id, globalUp(), teamAId, teamBId, thru || null); onSaved(); setOpen(false); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "12px 14px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>🦆 {m.sideA.map((p) => shortName(p.full_name)).join(" / ")}</div>
        <div className={`live-pill ${st.cls}`}>{st.txt}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.sideB.map((p) => shortName(p.full_name)).join(" / ")} 🇮🇹</div>
      </div>
      {mine && (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: "10px 14px" }}>
          {!open ? (
            <button className="mini-btn" onClick={() => setOpen(true)}>✍️ Cargar mi partido</button>
          ) : (
            <>
              <div className="segbar" style={{ marginTop: 0 }}>
                <button className={adv === "up" ? "on" : ""} onClick={() => setAdv("up")}>Vamos arriba</button>
                <button className={adv === "as" ? "on" : ""} onClick={() => setAdv("as")}>Empatados</button>
                <button className={adv === "down" ? "on" : ""} onClick={() => setAdv("down")}>Vamos abajo</button>
              </div>
              {adv !== "as" && (
                <div className="live-steppers">
                  <div><span>Por</span><button onClick={() => setDiff((d) => Math.max(1, d - 1))}>−</button><b className="tabular">{diff}</b><button onClick={() => setDiff((d) => Math.min(10, d + 1))}>＋</button></div>
                </div>
              )}
              <div className="live-steppers">
                <div><span>Hoyo</span><button onClick={() => setThru((t) => Math.max(0, t - 1))}>−</button><b className="tabular">{thru}</b><button onClick={() => setThru((t) => Math.min(18, t + 1))}>＋</button></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn-ghost" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={partial}>Guardar parcial</button>
                <button className="btn-primary" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={final}>Cerrar partido</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
