"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { addDaysISO, formatBR, isoToDateOnly, todayISO } from "@/lib/dates";
import { buildRule, parseRule } from "@/lib/recurrence";
import { localTime, spInstant } from "@/lib/agenda";
import { fail, logActivity, refreshAll, type Result } from "./_shared";

const id = z.string().min(1).max(40);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const recurrenceInput = z.object({
  freq: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.number().int().min(1).max(12).default(1),
  byDay: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  byMonthDay: z.number().int().min(1).max(31).nullish(),
  until: iso.nullish(),
});

const eventInput = z
  .object({
    title: z.string().trim().min(1, "Informe o título do compromisso.").max(200),
    type: z.enum(["MEETING", "CLIENT_VISIT", "TECH_VISIT", "AUDIT", "SECTOR_MEETING", "PERSONAL_BLOCK", "FOLLOW_UP"]),
    date: iso,
    start: hhmm,
    end: hhmm,
    allDay: z.boolean().default(false),
    location: z.string().trim().max(200).nullish(),
    sectorId: id.nullish(),
    demandId: id.nullish(),
    linkedActionId: id.nullish(),
    attendees: z.string().trim().max(1000).nullish(),
    reminderMinutes: z.number().int().min(-1).max(10080).nullish(),
    recurrence: recurrenceInput.default({ freq: "NONE", interval: 1, byDay: [] }),
  })
  .refine((d) => d.allDay || d.end > d.start, { message: "O fim precisa ser depois do início.", path: ["end"] });

type EventInput = z.infer<typeof eventInput>;

function times(d: EventInput, date = d.date) {
  const startsAt = spInstant(date, d.allDay ? "00:00" : d.start);
  const endsAt = spInstant(date, d.allDay ? "23:59" : d.end);
  return { startsAt, endsAt };
}

function ruleOf(d: EventInput): string | null {
  const r = d.recurrence;
  if (r.freq === "NONE") return null;
  return buildRule({
    freq: r.freq,
    interval: r.interval,
    byDay: r.freq === "WEEKLY" && !r.byDay.length ? [new Date(`${d.date}T12:00:00Z`).getUTCDay()] : r.byDay,
    byMonthDay: r.freq === "MONTHLY" ? (r.byMonthDay ?? Number(d.date.slice(8))) : null,
    until: r.until ?? null,
  });
}

async function checkLinks(ownerId: string, d: EventInput) {
  if (d.sectorId && !(await db.sector.findFirst({ where: { id: d.sectorId, ownerId } }))) throw new Error("Setor não encontrado.");
  if (d.demandId && !(await db.demand.findFirst({ where: { id: d.demandId, ownerId } }))) throw new Error("Demanda não encontrada.");
  if (d.linkedActionId && !(await db.action.findFirst({ where: { id: d.linkedActionId, ownerId } }))) throw new Error("Ação não encontrada.");
}

function fields(d: EventInput) {
  return {
    title: d.title,
    type: d.type,
    allDay: d.allDay,
    location: d.location || null,
    sectorId: d.sectorId || null,
    demandId: d.demandId || null,
    linkedActionId: d.linkedActionId || null,
    attendees: d.attendees || null,
    reminderMinutes: d.reminderMinutes ?? null,
  };
}

async function ownEvent(ownerId: string, eventId: string) {
  const e = await db.event.findFirst({ where: { id: id.parse(eventId), ownerId, deletedAt: null } });
  if (!e) throw new Error("Compromisso não encontrado.");
  return e;
}

/** Cria o registro próprio de uma ocorrência de série (para ata, anexos, ações ou edição isolada). */
async function materialize(ownerId: string, seriesId: string, date: string) {
  const s = await ownEvent(ownerId, seriesId);
  if (!s.rrule) return s.id;
  const existing = await db.event.findFirst({ where: { ownerId, parentId: s.id, occurrenceDate: isoToDateOnly(date)!, deletedAt: null } });
  if (existing) return existing.id;
  const dur = s.endsAt.getTime() - s.startsAt.getTime();
  const startsAt = spInstant(date, localTime(s.startsAt));
  const child = await db.event.create({
    data: {
      ownerId,
      title: s.title,
      type: s.type,
      allDay: s.allDay,
      location: s.location,
      sectorId: s.sectorId,
      demandId: s.demandId,
      linkedActionId: s.linkedActionId,
      attendees: s.attendees,
      reminderMinutes: s.reminderMinutes,
      startsAt,
      endsAt: new Date(startsAt.getTime() + dur),
      parentId: s.id,
      occurrenceDate: isoToDateOnly(date),
      demo: s.demo,
    },
  });
  await db.event.update({ where: { id: s.id }, data: { exdates: { push: isoToDateOnly(date)! } } });
  return child.id;
}

/** Garante um registro para a ocorrência (série + data) e devolve o id. */
export async function ensureOccurrence(eventId: string, date: string | null): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const e = await ownEvent(user.id, eventId);
    const realId = e.rrule && date ? await materialize(user.id, e.id, iso.parse(date)) : e.id;
    refreshAll();
    return { ok: true, data: { id: realId } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Cria ou edita um compromisso.
 * - target ausente: novo compromisso (ou série, se houver recorrência).
 * - scope "single" numa série: edita só aquela data.
 * - scope "series": edita a série inteira (mantém a data de início da série).
 */
export async function saveEvent(
  raw: z.input<typeof eventInput>,
  target?: { id: string; scope: "single" | "series"; date?: string | null },
): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = eventInput.parse(raw);
    await checkLinks(user.id, d);

    if (!target) {
      const e = await db.event.create({ data: { ownerId: user.id, ...fields(d), ...times(d), rrule: ruleOf(d) } });
      await logActivity({ ownerId: user.id, sectorId: e.sectorId, entityType: "event", entityId: e.id, verb: "created", summary: `Compromisso agendado: ${e.title} (${formatBR(d.date)})` });
      refreshAll();
      return { ok: true, data: { id: e.id } };
    }

    const cur = await ownEvent(user.id, target.id);
    if (cur.rrule && target.scope === "single") {
      const childId = await materialize(user.id, cur.id, iso.parse(target.date ?? d.date));
      await db.event.update({ where: { id: childId }, data: { ...fields(d), ...times(d) } });
      refreshAll();
      return { ok: true, data: { id: childId } };
    }
    if (cur.rrule) {
      // série inteira: mantém a data de início original, aplica horário e demais campos
      const seriesStart = todayISO(cur.startsAt);
      await db.event.update({
        where: { id: cur.id },
        data: { ...fields(d), ...times(d, seriesStart), rrule: ruleOf({ ...d, date: seriesStart }) },
      });
      refreshAll();
      return { ok: true, data: { id: cur.id } };
    }
    // avulso ou ocorrência já separada
    await db.event.update({
      where: { id: cur.id },
      data: { ...fields(d), ...times(d), ...(cur.parentId ? {} : { rrule: ruleOf(d) }) },
    });
    refreshAll();
    return { ok: true, data: { id: cur.id } };
  } catch (e) {
    return fail(e);
  }
}

export type EventUndo =
  | { kind: "restore"; ids: string[] }
  | { kind: "unexclude"; seriesId: string; date: string }
  | { kind: "rrule"; seriesId: string; rrule: string };

/** Exclui: só esta data, esta e as próximas, ou tudo. Devolve como desfazer. */
export async function deleteEvent(eventId: string, scope: "single" | "following" | "all", date?: string | null): Promise<Result<{ undo: EventUndo }>> {
  try {
    const user = await actionUser();
    const e = await ownEvent(user.id, eventId);
    const now = new Date();
    // ocorrência já separada de uma série: trata a partir da série
    const series = e.parentId ? await db.event.findFirst({ where: { id: e.parentId, ownerId: user.id } }) : e.rrule ? e : null;
    const day = date ?? (e.occurrenceDate ? e.occurrenceDate.toISOString().slice(0, 10) : todayISO(e.startsAt));

    if (!series || scope === "all") {
      const ids = series ? [series.id, ...(await db.event.findMany({ where: { parentId: series.id, deletedAt: null }, select: { id: true } })).map((x) => x.id)] : [e.id];
      await db.event.updateMany({ where: { id: { in: ids }, ownerId: user.id }, data: { deletedAt: now } });
      refreshAll();
      return { ok: true, data: { undo: { kind: "restore", ids } } };
    }
    if (scope === "single") {
      if (e.parentId) {
        await db.event.update({ where: { id: e.id }, data: { deletedAt: now } });
        refreshAll();
        return { ok: true, data: { undo: { kind: "restore", ids: [e.id] } } };
      }
      await db.event.update({ where: { id: series.id }, data: { exdates: { push: isoToDateOnly(iso.parse(day))! } } });
      refreshAll();
      return { ok: true, data: { undo: { kind: "unexclude", seriesId: series.id, date: day } } };
    }
    // esta e as próximas: encerra a série no dia anterior
    const r = parseRule(series.rrule);
    if (!r) throw new Error("Série inválida.");
    const prev = series.rrule!;
    await db.event.update({ where: { id: series.id }, data: { rrule: buildRule({ ...r, until: addDaysISO(iso.parse(day), -1) }) } });
    await db.event.updateMany({ where: { parentId: series.id, ownerId: user.id, occurrenceDate: { gte: isoToDateOnly(day)! } }, data: { deletedAt: now } });
    refreshAll();
    return { ok: true, data: { undo: { kind: "rrule", seriesId: series.id, rrule: prev } } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoDeleteEvent(undo: EventUndo): Promise<Result> {
  try {
    const user = await actionUser();
    if (undo.kind === "restore") {
      await db.event.updateMany({ where: { id: { in: undo.ids }, ownerId: user.id }, data: { deletedAt: null } });
    } else if (undo.kind === "unexclude") {
      const s = await ownEvent(user.id, undo.seriesId);
      await db.event.update({ where: { id: s.id }, data: { exdates: s.exdates.filter((d) => d.toISOString().slice(0, 10) !== undo.date) } });
    } else {
      const s = await ownEvent(user.id, undo.seriesId);
      await db.event.update({ where: { id: s.id }, data: { rrule: undo.rrule } });
      await db.event.updateMany({ where: { parentId: s.id, ownerId: user.id }, data: { deletedAt: null } });
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Salva ata e participantes (numa série, cria o registro da data). */
export async function saveMinutes(eventId: string, date: string | null, minutes: string, attendees: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const e = await ownEvent(user.id, eventId);
    const realId = e.rrule && date ? await materialize(user.id, e.id, iso.parse(date)) : e.id;
    await db.event.update({
      where: { id: realId },
      data: { minutes: z.string().max(50000).parse(minutes) || null, attendees: z.string().max(1000).parse(attendees).trim() || null },
    });
    refreshAll();
    return { ok: true, data: { id: realId } };
  } catch (e) {
    return fail(e);
  }
}

const minuteAction = z.object({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(["DO", "DELEGATE", "FOLLOW_UP", "DECIDE"]).default("DO"),
  assigneeId: id.nullish(),
  sectorId: id.nullish(),
  dueDate: iso.nullish(),
  urgent: z.boolean().default(false),
  important: z.boolean().default(false),
});

/** Gera ações (responsável + prazo) a partir da ata do compromisso. */
export async function createActionsFromMinutes(eventId: string, date: string | null, items: z.input<typeof minuteAction>[]): Promise<Result<{ id: string; count: number }>> {
  try {
    const user = await actionUser();
    const list = z.array(minuteAction).min(1, "Escolha pelo menos uma ação.").max(50).parse(items);
    const e = await ownEvent(user.id, eventId);
    const realId = e.rrule && date ? await materialize(user.id, e.id, iso.parse(date)) : e.id;
    const ev = await db.event.findUniqueOrThrow({ where: { id: realId } });
    const note = `${ev.title} · ${formatBR(todayISO(ev.startsAt))}`;
    const people = new Set((await db.person.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((p) => p.id));
    for (const a of list) {
      const assignee = a.assigneeId && people.has(a.assigneeId) ? a.assigneeId : null;
      await db.action.create({
        data: {
          ownerId: user.id,
          title: a.title,
          kind: a.kind,
          assigneeId: assignee,
          sectorId: a.sectorId ?? ev.sectorId,
          dueDate: isoToDateOnly(a.dueDate ?? null),
          urgent: a.urgent,
          important: a.important,
          origin: "MEETING",
          originNote: note,
          eventId: ev.id,
          demandId: ev.demandId,
          status: assignee ? "WAITING" : "TODO",
          lastFollowUpAt: assignee ? new Date() : null,
        },
      });
    }
    await logActivity({
      ownerId: user.id,
      sectorId: ev.sectorId,
      entityType: "event",
      entityId: ev.id,
      verb: "minutes",
      summary: `${list.length} ${list.length === 1 ? "ação gerada" : "ações geradas"} da ata: ${ev.title}`,
    });
    refreshAll();
    return { ok: true, data: { id: ev.id, count: list.length } };
  } catch (e) {
    return fail(e);
  }
}
