import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getActionsByIds } from "@/lib/data";
import { localTime } from "@/lib/agenda";
import { getEventOptions } from "@/lib/event-options";
import { dateOnlyToISO, isoToDateOnly, todayISO } from "@/lib/dates";
import { describeRule, expandDates } from "@/lib/recurrence";
import { EventDetail, type EventDetailData } from "./event-detail";

export const metadata: Metadata = { title: "Compromisso" };

export default async function EventPage({ params, searchParams }: PageProps<"/agenda/evento/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const d = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : null;

  const e = await db.event.findFirst({
    where: { id, ownerId: user.id, deletedAt: null },
    include: {
      demand: { select: { id: true, title: true, sector: { select: { slug: true } } } },
      linkedAction: { select: { id: true, title: true } },
      parent: { select: { rrule: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!e) notFound();

  let date = todayISO(e.startsAt);
  let virtual = false;
  if (e.rrule) {
    date = d ?? date;
    // já existe registro próprio para esta data? vai para ele
    const child = await db.event.findFirst({ where: { parentId: e.id, occurrenceDate: isoToDateOnly(date)!, deletedAt: null }, select: { id: true } });
    if (child) redirect(`/agenda/evento/${child.id}`);
    const valid = expandDates(todayISO(e.startsAt), e.rrule, date, date, e.exdates.map((x) => dateOnlyToISO(x)!));
    if (!valid.length) notFound();
    virtual = true;
  }

  const durMin = Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60000);
  const start = localTime(e.startsAt);
  const [sh, sm] = start.split(":").map(Number);
  const endMin = Math.min(23 * 60 + 59, sh * 60 + sm + durMin);
  const end = virtual ? `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}` : localTime(e.endsAt);

  const actionIds = virtual ? [] : (await db.action.findMany({ where: { ownerId: user.id, eventId: e.id, deletedAt: null }, select: { id: true } })).map((a) => a.id);
  const [actions, options] = await Promise.all([getActionsByIds(user.id, actionIds), getEventOptions(user.id)]);

  const data: EventDetailData = {
    eventId: e.id,
    seriesId: e.rrule ? e.id : e.parentId,
    virtual,
    date,
    start,
    end,
    allDay: e.allDay,
    title: e.title,
    type: e.type,
    location: e.location,
    sectorId: e.sectorId,
    demand: e.demand ? { id: e.demand.id, title: e.demand.title, sectorSlug: e.demand.sector.slug } : null,
    linkedAction: e.linkedAction,
    attendees: e.attendees,
    reminderMinutes: e.reminderMinutes,
    minutes: e.minutes,
    rrule: e.rrule ?? e.parent?.rrule ?? null,
    ruleText: describeRule(e.rrule ?? e.parent?.rrule),
    attachments: e.attachments.map((a) => ({ id: a.id, url: a.url, name: a.name, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt.toISOString() })),
    actions: actions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };

  return (
    <div className="mx-auto max-w-[820px] md:px-7 md:pt-6">
      <div className="px-2 pt-1 md:px-0">
        <Link href={`/agenda?v=semana&d=${date}`} className="inline-flex h-11 items-center gap-0.5 px-2 text-[17px] font-medium text-ac-text md:px-0 md:text-[14px]">
          <ChevronLeft className="size-[22px] md:size-4" /> Agenda
        </Link>
      </div>
      <EventDetail data={data} options={options} />
    </div>
  );
}
