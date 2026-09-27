/** Mensaje de un error: los de Supabase son objetos planos { message }, no instancias de Error. */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message ?? "");
  return typeof e === "string" ? e : "";
}

/** Falla de red / sin señal / pedido colgado. */
export function isNetworkError(e: unknown): boolean {
  return !navigator.onLine || /timeout|fetch|network|load failed|connection/i.test(errMsg(e));
}

/** "No se pudo guardar: sin señal. Probá de nuevo." / "No se pudo guardar: <motivo>" */
export function errText(e: unknown, fallback: string): string {
  if (isNetworkError(e)) return `${fallback}: sin señal. Probá de nuevo en un rato.`;
  const m = errMsg(e);
  return m ? `${fallback}: ${m}` : fallback;
}
