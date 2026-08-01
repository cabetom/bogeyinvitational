import { useEffect, useState } from "react";
import { useNav } from "../App";
import { useAuth } from "../auth/AuthProvider";
import { installAvailable, isIOS, isStandalone, onInstallChange, promptInstall } from "../lib/pwa";

function InstallApp() {
  const [avail, setAvail] = useState(installAvailable());
  const [tip, setTip] = useState(false);
  useEffect(() => onInstallChange(() => setAvail(installAvailable())), []);

  if (isStandalone()) return null; // ya está instalada

  async function onClick() {
    if (avail) {
      await promptInstall();
    } else {
      setTip(true); // iOS u otros: mostrar instrucciones
    }
  }

  return (
    <div className="install-row">
      <button className="btn-ghost" onClick={onClick}>📲 Instalar la app en tu celu</button>
      {tip && (
        <div className="ios-tip">
          {isIOS() ? (
            <>En iPhone: tocá el botón <b>Compartir</b> (el cuadrado con la flecha ↑) y elegí <b>“Agregar a inicio”</b>.</>
          ) : (
            <>En tu navegador, abrí el menú (⋮) y elegí <b>“Instalar app”</b> o <b>“Agregar a pantalla de inicio”</b>.</>
          )}
        </div>
      )}
    </div>
  );
}

export function Mas() {
  const nav = useNav();
  const { player } = useAuth();

  const rows: { icon: string; title: string; sub: string; to: Parameters<typeof nav>[0] }[] = [
    { icon: "🔴", title: "Partidos en vivo", sub: "Seguí los fourball hoyo a hoyo", to: "live" },
    { icon: "🏆", title: "Premios", sub: "Palmarés y premios de la edición", to: "premios" },
    { icon: "📍", title: "El viaje", sub: "Canchas, fechas y logística", to: "viaje" },
    { icon: "🚐", title: "Camionetas", sub: "Quién va con quién · ida y vuelta", to: "vans" },
    { icon: "💸", title: "Presupuesto y gastos", sub: "Estimado y división de cuentas", to: "presu" },
    { icon: "👤", title: "Mi perfil", sub: "Tus tarjetas, récord e historial", to: "perfil" },
  ];

  return (
    <>
      <div className="menu-hero">
        <i className="logo l-mascot" style={{ width: 56, height: 59 }} aria-hidden="true" />
        <div><div className="t">Bogey Invitational</div><div className="s">Todo lo del viaje, en un lugar</div></div>
      </div>
      <div className="mlist">
        {rows.map((r) => (
          <button className="mrow" key={r.to} onClick={() => nav(r.to)}>
            <div className="mi">{r.icon}</div>
            <div><div className="mt">{r.title}</div><div className="ms">{r.sub}</div></div>
            <span className="go">›</span>
          </button>
        ))}
        {player?.is_admin && (
          <button className="mrow" onClick={() => nav("admin")}>
            <div className="mi">🛡️</div>
            <div><div className="mt">Gestión de jugadores <span className="chip admin" style={{ marginLeft: 4 }}>Admin</span></div><div className="ms">Agregar o sacar jugadores del torneo</div></div>
            <span className="go">›</span>
          </button>
        )}
      </div>
      <InstallApp />
    </>
  );
}
