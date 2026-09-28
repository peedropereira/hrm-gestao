import { TZDate } from "@date-fns/tz";

// Tudo que é "dia" no sistema é uma string ISO yyyy-mm-dd no fuso de São Paulo.
// Datas só-dia vêm do banco como meia-noite UTC; convertemos sem aplicar fuso.

export const TZ = "America/Sao_Paulo";
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAYS_LONG = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Hoje em São Paulo, como yyyy-mm-dd. */
export function todayISO(now: Date = new Date()): string {
  const d = new TZDate(now, TZ);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hora atual em São Paulo como HH:mm. */
export function nowTimeSP(now: Date = new Date()): string {
  const d = new TZDate(now, TZ);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converte um Date vindo de coluna @db.Date para yyyy-mm-dd. */
export function dateOnlyToISO(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Converte yyyy-mm-dd para Date à meia-noite UTC (para gravar em @db.Date). */
export function isoToDateOnly(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoToUTC(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Diferença em dias: b - a (ambos yyyy-mm-dd). */
export function diffDays(a: string, b: string): number {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / 86_400_000);
}

export function addDaysISO(iso: string, n: number): string {
  const t = new Date(isoToUTC(iso) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): number {
  return new Date(isoToUTC(iso)).getUTCDay();
}

/** Próxima segunda-feira depois de hoje. */
export function nextMondayISO(today: string): string {
  const wd = weekdayOf(today);
  const add = ((1 - wd + 7) % 7) || 7;
  return addDaysISO(today, add);
}

/** Dias úteis (seg–sex) entre a e b, sem contar o dia a. */
export function businessDaysBetween(a: string, b: string): number {
  let n = 0;
  let cur = a;
  while (cur < b) {
    cur = addDaysISO(cur, 1);
    const wd = weekdayOf(cur);
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** dd/mm/aaaa */
export function formatBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "qua 30/09" */
export function formatShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${WEEKDAYS_SHORT[weekdayOf(iso)]} ${d}/${m}`;
}

/** "Segunda-feira, 28/09/2026" */
export function formatLong(iso: string): string {
  return `${WEEKDAYS_LONG[weekdayOf(iso)]}, ${formatBR(iso)}`;
}

/** "28 de setembro de 2026" */
export function formatExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Data e hora (timestamp) no fuso de SP: "25/09 09:12" */
export function formatDateTimeShort(d: Date): string {
  const z = new TZDate(d, TZ);
  return `${pad(z.getDate())}/${pad(z.getMonth() + 1)} ${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

export function timestampToISODate(d: Date): string {
  return todayISO(d);
}

/** Saudação conforme a hora em SP. */
export function greeting(now: Date = new Date()): string {
  const h = new TZDate(now, TZ).getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Converte dd/mm/aaaa (ou dd/mm) para ISO. */
export function brToISO(s: string, fallbackYear: number): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : fallbackYear;
  if (y < 100) y += 2000;
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
