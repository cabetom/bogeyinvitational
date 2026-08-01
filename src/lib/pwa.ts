/** Captura el evento de instalación (Android/desktop Chrome) apenas ocurre. */
let deferred: (Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }) | null = null;
const subs = new Set<() => void>();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as never;
  subs.forEach((f) => f());
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  subs.forEach((f) => f());
});

export function installAvailable(): boolean {
  return deferred !== null;
}
export function onInstallChange(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === "accepted") {
    deferred = null;
    subs.forEach((f) => f());
  }
  return outcome === "accepted";
}
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
}
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
