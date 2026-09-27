import type { Fixture } from "./types";

const TZ = "America/Argentina/Cordoba";

/** Fecha de hoy en Argentina, "YYYY-MM-DD". */
export function todayAR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** La fecha de hoy; si no hay, la próxima; si ya pasaron todas, la última. */
export function pickDefaultFixture<T extends Pick<Fixture, "id" | "date" | "day_no">>(fixtures: T[]): T | undefined {
  if (!fixtures.length) return undefined;
  const sorted = [...fixtures].sort((a, b) => a.day_no - b.day_no);
  const today = todayAR();
  return (
    sorted.find((f) => f.date === today) ??
    sorted.find((f) => f.date != null && f.date > today) ??
    sorted[sorted.length - 1]
  );
}

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "2026-09-30" -> "Mié 30/9" */
export function fmtDay(date: string | null | undefined): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DOW[dow]} ${d}/${m}`;
}

/** "09:30:00" -> "9:30" */
export function fmtTee(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}:${m}`;
}

/** "Día 1 · Córdoba Golf · Mié 30/9" */
export function fixtureLabel(f: Pick<Fixture, "day_no" | "date"> & { courseName?: string | null }): string {
  const parts = [`Día ${f.day_no}`];
  if (f.courseName) parts.push(f.courseName);
  if (f.date) parts.push(fmtDay(f.date));
  return parts.join(" · ");
}
