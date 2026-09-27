import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { changePassword, lookupWegolf, matriculaStatus, registerPlayer, signInWithMatricula, type WegolfInfo } from "../lib/auth";
import { useAuth } from "../auth/AuthProvider";

type Step = "matricula" | "password" | "register";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export function Login() {
  const [step, setStep] = useState<Step>("matricula");
  const [matricula, setMatricula] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onContinue(e: FormEvent) {
    e.preventDefault();
    const m = matricula.trim();
    if (!m) return;
    if (m.length < 3) { setErr("Revisá la matrícula"); return; }
    setErr(null); setBusy(true);
    try {
      setStep((await matriculaStatus(m)) === "registered" ? "password" : "register");
    } catch {
      // sin señal / error: probar directo con contraseña
      setStep("password");
    } finally { setBusy(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!matricula.trim() || !password) return;
    setErr(null);
    setBusy(true);
    try {
      await signInWithMatricula(matricula, password);
      // onAuthStateChange se encarga del resto.
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo iniciar sesión");
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // redirige a Google; no vuelve acá.
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo iniciar sesión");
      setBusy(false);
    }
  }

  const back = () => { setStep("matricula"); setPassword(""); setErr(null); };

  if (step === "register") return <Register matricula={matricula.trim()} onBack={back} />;

  return (
    <div className="login">
      <img className="logo-orig" src="/logo-original.png" alt="Bogey Invitational" />
      {step === "matricula" ? (
        <>
          <p>Entrá con tu matrícula para ver el torneo y cargar tus tarjetas.</p>
          <form className="login-form" onSubmit={onContinue}>
            <input
              className="login-field"
              inputMode="numeric"
              autoComplete="username"
              placeholder="Tu matrícula"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
            <button className="btn-login" type="submit" disabled={busy || !matricula}>
              {busy ? "Buscando…" : "Continuar"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p>Matrícula <b>{matricula}</b> · <button className="login-link" style={{ marginTop: 0 }} onClick={back}>cambiar</button></p>
          <form className="login-form" onSubmit={onSubmit}>
            <input type="text" autoComplete="username" value={matricula} readOnly hidden />
            <input
              className="login-field"
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button className="btn-login" type="submit" disabled={busy || !password}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <p style={{ fontSize: 11.5, color: "#7E8F7E", marginTop: 12 }}>
            Si te cargó un capitán, la primera vez la contraseña es tu matrícula.<br />¿Te la olvidaste? Pedile a un admin que te la resetee.
          </p>
        </>
      )}
      {err && <div className="err">{err}</div>}

      <div className="login-or"><span>o</span></div>
      <button className="btn-google" disabled={busy} onClick={signInGoogle}>
        <GoogleIcon />
        Entrar con Google
      </button>
      <p style={{ fontSize: 11.5, color: "#9DB29A", marginTop: 10 }}>
        Con Google, usá el mismo Gmail con el que estás cargado en el torneo.
      </p>
    </div>
  );
}

/** Primer ingreso de alguien que no está cargado: nombre, apellido, equipo y contraseña. Se valida contra we.golf. */
function Register({ matricula, onBack }: { matricula: string; onBack: () => void }) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [team, setTeam] = useState<"Pato" | "Tano" | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wg, setWg] = useState<WegolfInfo | null>(null);

  useEffect(() => { lookupWegolf(matricula).then(setWg).catch(() => setWg(null)); }, [matricula]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (nombre.trim().length < 2 || apellido.trim().length < 2) return setErr("Completá tu nombre y apellido.");
    if (!team) return setErr("Elegí tu equipo.");
    if (pw.length < 6) return setErr("La contraseña tiene que tener al menos 6 caracteres.");
    if (pw === matricula) return setErr("La contraseña no puede ser tu matrícula.");
    if (pw !== pw2) return setErr("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      await registerPlayer({ matricula, nombre: nombre.trim(), apellido: apellido.trim(), team, password: pw });
      await signInWithMatricula(matricula, pw); // entra directo
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo registrar");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img className="logo-orig small" src="/logo-original.png" alt="Bogey Invitational" />
      <p><b>¡Bienvenido!</b> La matrícula <b>{matricula}</b> todavía no está registrada. Completá tus datos para entrar.</p>
      {wg?.found === false && <div className="err">No encontramos esa matrícula en we.golf. <button className="login-link" style={{ marginTop: 0 }} onClick={onBack}>Revisala</button></div>}
      {wg?.found && wg.fullname && <p className="login-hint">En we.golf figurás como <b>{wg.fullname}</b>{wg.index != null ? ` · hándicap ${wg.index < 0 ? `+${-wg.index}` : wg.index}` : ""}</p>}
      <form className="login-form" onSubmit={onSubmit}>
        <input className="login-field" placeholder="Nombre" autoComplete="given-name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="login-field" placeholder="Apellido" autoComplete="family-name" value={apellido} onChange={(e) => setApellido(e.target.value)} />

        <div className="login-lbl">¿De qué equipo sos?</div>
        <div className="team-pick">
          <button type="button" className={`tp pato ${team === "Pato" ? "on" : ""}`} onClick={() => setTeam("Pato")} aria-pressed={team === "Pato"}>
            <span className="tp-emoji">🦆</span><span className="tp-name">Pato</span><span className="tp-cap">Equipo del Pato</span>
          </button>
          <button type="button" className={`tp tano ${team === "Tano" ? "on" : ""}`} onClick={() => setTeam("Tano")} aria-pressed={team === "Tano"}>
            <span className="tp-emoji"><span className="flag-it" aria-hidden="true"><i /><i /><i /></span></span><span className="tp-name">Tano</span><span className="tp-cap">Equipo del Tano</span>
          </button>
        </div>

        <input type="text" autoComplete="username" value={matricula} readOnly hidden />
        <input className="login-field" type="password" autoComplete="new-password" placeholder="Elegí una contraseña (mín. 6)" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="login-field" type="password" autoComplete="new-password" placeholder="Repetila" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <button className="btn-login" type="submit" disabled={busy}>{busy ? "Registrando…" : "Registrarme y entrar"}</button>
        {err && <div className="err">{err}</div>}
      </form>
      <p style={{ fontSize: 11.5, color: "#7E8F7E", marginTop: 12 }}>
        Los jugadores de este año los carga cada capitán. Registrándote podés seguir el torneo y cómo viene tu equipo.
      </p>
      <button className="login-link" onClick={onBack}>‹ Volver</button>
    </div>
  );
}

/** Formulario de cambio de contraseña. `forced` = primer login (no se puede saltear). */
export function ChangePassword({ forced, matricula, onDone }: { forced: boolean; matricula?: string | null; onDone?: () => void }) {
  const { signOut } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 6) return setErr("Mínimo 6 caracteres");
    if (matricula && pw === matricula) return setErr("No puede ser tu matrícula");
    if (pw !== pw2) return setErr("Las contraseñas no coinciden");
    setBusy(true);
    try {
      await changePassword(pw);
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
      setBusy(false);
    }
  }

  const form = (
    <form className="login-form" onSubmit={onSubmit}>
      <input className="login-field" type="password" autoComplete="new-password" placeholder="Contraseña nueva" value={pw} onChange={(e) => setPw(e.target.value)} />
      <input className="login-field" type="password" autoComplete="new-password" placeholder="Repetila" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      <button className="btn-login" type="submit" disabled={busy || !pw || !pw2}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
      {err && <div className="err">{err}</div>}
    </form>
  );

  if (!forced) return form;

  return (
    <div className="login">
      <img className="logo-orig" src="/logo-original.png" alt="Bogey Invitational" />
      <p><b>¡Bienvenido!</b> Antes de seguir, elegí una contraseña nueva (mínimo 6 caracteres).</p>
      {form}
      <button className="login-link" onClick={signOut}>Salir</button>
    </div>
  );
}
