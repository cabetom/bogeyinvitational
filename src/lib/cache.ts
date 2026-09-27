/** Copia local de datos que casi no cambian (fechas, plantel, hoyos) para poder cargar tarjetas sin señal. */
export function cacheGet<T>(key: string): T | null {
  try { const s = localStorage.getItem(`bogey-cache:${key}`); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
export function cacheSet(key: string, value: unknown): void {
  try { localStorage.setItem(`bogey-cache:${key}`, JSON.stringify(value)); } catch { /* lleno o bloqueado */ }
}
