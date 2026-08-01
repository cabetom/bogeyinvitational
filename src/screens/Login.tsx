import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo enviar el link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <i className="logo l-badge" role="img" aria-label="Bogey Invitational" />
      <h1>Bogey Invitational</h1>
      {sent ? (
        <div className="ok">
          Te mandamos un <b>link mágico</b> a<br />
          <b>{email}</b>.<br />
          Abrilo desde este dispositivo para entrar.
        </div>
      ) : (
        <>
          <p>Ingresá con tu mail y te mandamos un link para entrar. Sin contraseñas.</p>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && send()}
          />
          <button className="btn-primary" disabled={busy || !email.includes("@")} onClick={send}>
            {busy ? "Enviando…" : "Enviarme el link mágico"}
          </button>
          {err && <div className="err">{err}</div>}
        </>
      )}
    </div>
  );
}
