import "server-only";
import { TZDate } from "@date-fns/tz";
import { db } from "@/lib/db";
import { TZ, addDaysISO, dateOnlyToISO, todayISO } from "@/lib/dates";
import { describeRule, expandDates } from "@/lib/recurrence";
import type { OccurrenceDTO } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Hora local (São Paulo) de um instante: "08:00". */
export function localTime(d: Date) {
  const z = new TZDate(d, TZ);
  return `${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

/** Instante a partir de data e hora locais de São Paulo. */
export function spInstant(dateISO: string, hhmm: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, h, mi, 0, TZ).getTime());
}

const eventSelect = {
  id: true,
  title: true,
  type: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  location: true,
  sectorId: true,
  demandId: true,
  linkedActionId: true,
  attendees: true,
  rrule: true,
  exdates: true,
  parentId: true,
  occurrenceDate: true,
  minutes: true,
  parent: { select: { rrule: true } },
  _count: { select: { actions: { where: { deletedAt: null } }, attachments: true } },
} as const;

/** Compromissos (com as séries expandidas) entre duas datas, inclusive. */
export async function getOccurrences(ownerId: string, from: string, to: string, filter?: { sectorIds?: string[] }): Promise<OccurrenceDTO[]> {
  const rangeStart = spInstant(from, "00:00");
  const rangeEnd = spInstant(addDaysISO(to, 1), "00:00");
  const sector = filter?.sectorIds ? { sectorId: { in: filter.sectorIds } } : {};
  const rows = await db.event.findMany({
    where: {
      ownerId,
      deletedAt: null,
      ...sector,
      OR: [
        { rrule: null, startsAt: { lt: rangeEnd }, endsAt: { gte: rangeStart } },
        { rrule: { not: null }, startsAt: { lt: rangeEnd } },
      ],
    },
    select: eventSelect,
    orderBy: { startsAt: "asc" },
  });

  const out: OccurrenceDTO[] = [];
  for (const e of rows) {
    const startTime = localTime(e.startsAt);
    const durMin = Math.max(0, Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60000));
    const base = {
      title: e.title,
      type: e.type,
      allDay: e.allDay,
      location: e.location,
      sectorId: e.sectorId,
      demandId: e.demandId,
      linkedActionId: e.linkedActionId,
      attendees: e.attendees,
      hasMinutes: !!e.minutes?.trim(),
    };
    if (e.rrule) {
      const startDate = todayISO(e.startsAt);
      const dates = expandDates(startDate, e.rrule, from, to, e.exdates.map((d) => dateOnlyToISO(d)!));
      for (const date of dates) {
        const s = spInstant(date, startTime);
        const en = new Date(s.getTime() + durMin * 60000);
        out.push({
          ...base,
          key: `${e.id}:${date}`,
          eventId: e.id,
          seriesId: e.id,
          virtual: true,
          date,
          start: startTime,
          end: localTime(en),
          startsAt: s.toISOString(),
          endsAt: en.toISOString(),
          recurring: true,
          ruleText: describeRule(e.rrule),
          hasMinutes: false,
          actionsCount: 0,
          attachmentsCount: 0,
          href: `/agenda/evento/${e.id}?d=${date}`,
        });
      }
    } else {
      out.push({
        ...base,
        key: e.id,
        eventId: e.id,
        seriesId: e.parentId,
        virtual: false,
        date: todayISO(e.startsAt),
        start: startTime,
        end: localTime(e.endsAt),
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        recurring: !!e.parentId,
        ruleText: e.parent?.rrule ? describeRule(e.parent.rrule) : "",
        actionsCount: e._count.actions,
        attachmentsCount: e._count.attachments,
        href: `/agenda/evento/${e.id}`,
      });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || Number(b.allDay) - Number(a.allDay));
}
