import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lib/pwa"; // registra el evento de instalación apenas carga
import { registerSW } from "virtual:pwa-register";

// Si se sube un arreglo durante el viaje, los celulares lo toman solos: chequea al abrir la app,
// al volver a primer plano y cada 30 min; cuando hay versión nueva recarga (lo que se estaba
// cargando en una tarjeta queda guardado como borrador en el celu).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  },
});
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
