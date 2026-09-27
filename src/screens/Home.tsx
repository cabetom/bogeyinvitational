import { useEffect, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { supabase } from "../lib/supabase";
import { getFixtures } from "../lib/queries_matches";
import { fmtDay, fmtTee, pickDefaultFixture, todayAR } from "../lib/dates";
import type { Fixture } from "../lib/types";
import { SponsorsBlock } from "./Secciones";
import { shortName, Spinner } from "../ui/misc";

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

interface Today {
  fixture: Fixture & { courseName: string | null };
  partners: string[];
  rivals: string[];
  myCard: number | null | undefined; // undefined = no cargó
}

/** La fecha de hoy (o la próxima): cancha, hora, con quién jugás y si ya cargaste la tarjeta. */
function TodayCard() {
  const { currentEdition, version, ranking } = useAppData();
  const { player } = useAuth();
  const nav = useNav();
  const [today, setToday] = useState<Today | null>(null);

  useEffect(() => {
    if (!currentEdition) return;
    let alive = true;
    (async () => {
      const fx = await getFixtures(currentEdition.id);
      const f = pickDefaultFixture(fx);
      if (!f || !alive) return;
      let partners: string[] = [], rivals: string[] = [], myCard: number | null | undefined;
      if (player) {
        const [mp, card] = await Promise.all([
          supabase.from("match_players").select("match_id, side, matches!inner(fixture_id, match_players(side, player_id, players(full_name)))")
            .eq("player_id", player.id).eq("matches.fixture_id", f.id).maybeSingle(),
          supabase.from("scorecards").select("stableford").eq("fixture_id", f.id).eq("player_id", player.id).maybeSingle(),
        ]);
        if (mp.error) throw mp.error;
        if (card.error) throw card.error; // sin señal: no decir "no cargaste" si no lo sabemos
        const mine = mp.data as any;
        if (mine) {
          for (const x of mine.matches?.match_players ?? []) {
            if (x.player_id === player.id) continue;
            (x.side === mine.side ? partners : rivals).push(shortName(x.players?.full_name ?? "?"));
          }
        }
        myCard = card.data ? (card.data as any).stableford : undefined;
      }
      if (alive) setToday({ fixture: f, partners, rivals, myCard });
    })().catch(() => { /* sin señal: se reintenta con la próxima actualización */ });
    return () => { alive = false; };
  }, [currentEdition?.id, player?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!today) return null;
  const plays = !!player && ranking.some((r) => r.player.id === player.id); // Tomás es admin pero no juega
  const f = today.fixture;
  const isToday = f.date === todayAR();
  const past = f.date != null && f.date < todayAR();
  return (
    <div className="today-card">
      <div className="eyebrow">{isToday ? "Hoy se juega" : past ? "Última fecha" : "Próxima fecha"} · Día {f.day_no}</div>
      <div className="t">{f.courseName ?? "Cancha a definir"}</div>
      <div className="s">
        {fmtDay(f.date)}{f.tee_time ? ` · primer tee ${fmtTee(f.tee_time)} hs` : ""} · {f.modality === "individual" ? "Individual" : "Fourball"}
      </div>
      {(today.partners.length > 0 || today.rivals.length > 0) && (
        <div className="pair">
          {today.partners.length > 0 && <>Jugás con <b>{today.partners.join(" / ")}</b> </>}
          {today.rivals.length > 0 && <>contra <b>{today.rivals.join(" / ")}</b></>}
        </div>
      )}
      {plays && (isToday || past) && (
        today.myCard !== undefined ? (
          <div className="pair">✓ Tu tarjeta está cargada · <b>{today.myCard ?? "—"} pts</b> <button className="link" onClick={() => nav("cargar")}>Ver / corregir</button></div>
        ) : (
          <button className="btn-primary" onClick={() => nav("cargar")}>Cargar mi tarjeta de hoy</button>
        )
      )}
    </div>
  );
}

export function Home() {
  const { loading, error, edition, isCurrent, teams, teamScore, ranking, records, reload } = useAppData();
  const { player } = useAuth();
  const nav = useNav();

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="center-msg">
        No se pudieron cargar los datos (¿sin señal?). Reintentando…
        <button className="btn-primary" onClick={reload}>Reintentar ahora</button>
      </div>
    );
  }

  const pato = teams.find((t) => t.name === "Pato");
  const tano = teams.find((t) => t.name === "Tano");
  const pScore = pato ? teamScore[pato.id] ?? 0 : 0;
  const tScore = tano ? teamScore[tano.id] ?? 0 : 0;
  const leader = pScore === tScore ? null : pScore > tScore ? "Pato" : "Tano";

  const myRow = player ? ranking.find((r) => r.player.id === player.id) ?? null : null;
  const myRec = player ? records.find((r) => r.player.id === player.id) : null;

  return (
    <>
      <div className="scorebug">
        <i className="logo l-mascot wm" aria-hidden="true" />
        <div className="lbl">Copa por equipos · {edition?.name ?? ""}</div>
        <div className="row">
          <div className="team"><div className="nm"><span className="dot pato" />Pato</div><div className="sc">{fmtPts(pScore)}</div></div>
          <div className="vs">puntos</div>
          <div className="team"><div className="nm">Tano<span className="dot tano" /></div><div className="sc">{fmtPts(tScore)}</div></div>
        </div>
        <div className="lead-note">
          {leader ? <>Lidera <b>Equipo {leader}</b></> : <>Van <b>empatados</b></>}
        </div>
      </div>

      {isCurrent && <TodayCard />}

      <button className="live-cta" onClick={() => nav("live")}>
        <span className="rd" />
        <div><div className="t">Partidos en vivo</div><div className="s">Cómo van los partidos · cargá el tuyo</div></div>
        <span className="go">›</span>
      </button>

      {myRow && (
        <>
          <div className="sec-title"><h2>Vos, hasta acá</h2><button className="link" onClick={() => nav("perfil")}>Mi perfil →</button></div>
          <div className="grid2">
            <div className="stat"><div className="n tabular">{myRow.points}</div><div className="k">Pts. Stableford</div></div>
            <div className="stat"><div className="n tabular">{myRow.rounds ? `${myRow.pos}º` : "–"}</div><div className="k">en el ranking</div></div>
            <div className="stat"><div className="n tabular">{myRec ? `${myRec.wins}–${myRec.losses}${myRec.halved ? `–${myRec.halved}` : ""}` : "–"}</div><div className="k">Tus matches G–P{myRec?.halved ? "–E" : ""}</div></div>
            <div className="stat"><div className="n tabular">{myRow.rounds}</div><div className="k">Vueltas cargadas</div></div>
          </div>
        </>
      )}

      <div className="sec-title"><h2>Accesos</h2></div>
      <div className="grid2">
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => nav("cargar")}>
          <div className="n">＋</div><div className="k">Cargar tarjeta</div>
        </button>
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => nav("equipos")}>
          <div className="n">⛳</div><div className="k">La Copa</div>
        </button>
      </div>

      <SponsorsBlock />
    </>
  );
}
