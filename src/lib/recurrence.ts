// Recorrência de compromissos no padrão iCalendar (RRULE), subconjunto usado pelo app
// (e compatível com o Outlook/Microsoft Graph para a sincronização futura):
//   FREQ=DAILY|WEEKLY|MONTHLY ; INTERVAL=n ; BYDAY=MO,TU,... ; BYMONTHDAY=n ; UNTIL=AAAAMMDD
// Todas as datas são "dias" (yyyy-mm-dd) no fuso de São Paulo.

import { addDaysISO, diffDays, weekdayOf } from "./dates";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";
export type Rule = {
  freq: Freq;
  interval: number;
  byDay: number[]; // 0 = domingo … 6 = sábado
  byMonthDay: number | null;
  until: string | null; // yyyy-mm-dd (inclusive)
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function parseRule(rrule: string | null | undefined): Rule | null {
  if (!rrule) return null;
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/, "")
      .split(";")
      .map((p) => p.split("=") as [string, string]),
  );
  const freq = parts.FREQ as Freq;
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) return null;
  const until = parts.UNTIL ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}` : null;
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    byDay: parts.BYDAY ? parts.BYDAY.split(",").map((d: string) => DAY_CODES.indexOf(d.slice(-2))).filter((n: number) => n >= 0) : [],
    byMonthDay: parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : null,
    until,
  };
}

export function buildRule(r: Rule): string {
  const out = [`FREQ=${r.freq}`];
  if (r.interval > 1) out.push(`INTERVAL=${r.interval}`);
  if (r.freq === "WEEKLY" && r.byDay.length) out.push(`BYDAY=${[...r.byDay].sort().map((d) => DAY_CODES[d]).join(",")}`);
  if (r.freq === "DAILY" && r.byDay.length) out.push(`BYDAY=${[...r.byDay].sort().map((d) => DAY_CODES[d]).join(",")}`);
  if (r.freq === "MONTHLY" && r.byMonthDay) out.push(`BYMONTHDAY=${r.byMonthDay}`);
  if (r.until) out.push(`UNTIL=${r.until.replace(/-/g, "")}`);
  return out.join(";");
}

/** Texto em português: "Toda segunda", "A cada 2 semanas (seg, qua)", "Todo dia útil", "Todo mês, dia 5". */
export function describeRule(rrule: string | null | undefined): string {
  const r = parseRule(rrule);
  if (!r) return "";
  let txt = "";
  if (r.freq === "DAILY") {
    const weekdays = r.byDay.length === 5 && [1, 2, 3, 4, 5].every((d) => r.byDay.includes(d));
    txt = weekdays ? "Todo dia útil" : r.interval > 1 ? `A cada ${r.interval} dias` : "Todo dia";
  } else if (r.freq === "WEEKLY") {
    const days = r.byDay.length ? r.byDay : [];
    const names = days.map((d) => DAY_NAMES[d]);
    if (r.interval > 1) txt = `A cada ${r.interval} semanas${names.length ? ` (${names.join(", ")})` : ""}`;
    else if (names.length === 1) txt = `${days[0] === 0 || days[0] === 6 ? "Todo" : "Toda"} ${names[0]}`;
    else txt = `Toda semana${names.length ? `: ${names.join(", ")}` : ""}`;
  } else {
    txt = `${r.interval > 1 ? `A cada ${r.interval} meses` : "Todo mês"}${r.byMonthDay ? `, dia ${r.byMonthDay}` : ""}`;
  }
  if (r.until) {
    const [y, m, d] = r.until.split("-");
    txt += ` até ${d}/${m}/${y}`;
  }
  return txt;
}

/** Datas (yyyy-mm-dd) da série entre from e to (inclusive). */
export function expandDates(startISO: string, rrule: string, from: string, to: string, exdates: string[] = []): string[] {
  const r = parseRule(rrule);
  if (!r) return startISO >= from && startISO <= to ? [startISO] : [];
  const ex = new Set(exdates);
  const end = r.until && r.until < to ? r.until : to;
  const out: string[] = [];
  const startWd = weekdayOf(startISO);
  const days = r.byDay.length ? r.byDay : [startWd];
  // Começa no maior entre o início da série e o início do período (recuando para alinhar semanas).
  let cur = startISO > from ? startISO : from;
  let guard = 0;
  while (cur <= end && guard++ < 3700) {
    if (cur >= startISO && !ex.has(cur) && matches(r, startISO, cur, days)) out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function matches(r: Rule, start: string, date: string, days: number[]): boolean {
  const n = diffDays(start, date);
  if (n < 0) return false;
  if (r.freq === "DAILY") {
    if (r.byDay.length) return r.byDay.includes(weekdayOf(date));
    return n % r.interval === 0;
  }
  if (r.freq === "WEEKLY") {
    if (!days.includes(weekdayOf(date))) return false;
    // semanas contadas a partir do domingo da semana de início
    const startWeek = addDaysISO(start, -weekdayOf(start));
    const weeks = Math.floor(diffDays(startWeek, date) / 7);
    return weeks % r.interval === 0;
  }
  // MONTHLY
  const [sy, sm, sd] = start.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  const months = (y - sy) * 12 + (m - sm);
  if (months % r.interval !== 0) return false;
  return d === (r.byMonthDay ?? sd);
}

export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WEEKDAY_CODES = DAY_CODES;
