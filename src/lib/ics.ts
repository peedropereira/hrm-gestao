import "server-only";
import type { OccurrenceDTO } from "@/lib/types";

// Arquivos de calendário (.ics) com alarme, para o calendário do próprio celular tocar antes da reunião.

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (iso: string) => iso.replace(/-/g, "");

/** Quebra linhas longas (máx. 75 caracteres) como pede o padrão. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function icsEvent(o: OccurrenceDTO, opts: { origin: string; reminder: number }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${o.key.replace(/[^a-zA-Z0-9:-]/g, "")}@gestao-pedro-souza`,
    `DTSTAMP:${stamp(new Date())}`,
    ...(o.allDay
      ? [`DTSTART;VALUE=DATE:${day(o.date)}`, `DTEND;VALUE=DATE:${day(new Date(new Date(`${o.date}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10))}`]
      : [`DTSTART:${stamp(new Date(o.startsAt))}`, `DTEND:${stamp(new Date(o.endsAt))}`]),
    `SUMMARY:${esc(o.title)}`,
    ...(o.location ? [`LOCATION:${esc(o.location)}`] : []),
    `DESCRIPTION:${esc([o.attendees ? `Participantes: ${o.attendees}` : "", `${opts.origin}${o.href}`].filter(Boolean).join("\n"))}`,
    `URL:${opts.origin}${o.href}`,
  ];
  if (opts.reminder >= 0 && !o.allDay) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(o.title)}`, `TRIGGER:-PT${opts.reminder}M`, "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

export function icsCalendar(events: string[][], name: string) {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pedro Souza//Gestao Pessoal//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc(name)}`,
      "X-WR-TIMEZONE:America/Sao_Paulo",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
      ...events.flat(),
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
