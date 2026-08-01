export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}
export function notifyPermission(): NotificationPermission {
  return notifySupported() ? Notification.permission : "denied";
}
export async function requestNotify(): Promise<NotificationPermission> {
  if (!notifySupported()) return "denied";
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}
export async function notify(title: string, body: string): Promise<void> {
  if (!notifySupported() || Notification.permission !== "granted") return;
  const opts: NotificationOptions = { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "bogey-live" };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    try { new Notification(title, opts); } catch { /* ignore */ }
  }
}
