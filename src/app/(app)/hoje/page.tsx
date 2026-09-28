import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { addDaysISO, dateOnlyToISO, isoToDateOnly, nowTimeSP, todayISO, TZ } from "@/lib/dates";
import { getActionsByIds, getInboxCount, getOpenActions, getRecentDone, getSectorHealth } from "@/lib/data";
import { TodayView, type TodayEvent } from "./today-view";

export const metadata: Metadata = { title: "Hoje" };

/** Quantas ações estavam atrasadas no fim de cada uma das últimas N semanas. */
async function overdueTrend(ownerId: string, today: string, weeks = 8) {
  const rows = await db.action.findMany({
    where: { ownerId, deletedAt: null, dueDate: { not: null, gte: isoToDateOnly(addDaysISO(today, -weeks * 7 - 90))! } },
    select: { dueDate: true, createdAt: true, completedAt: true, status: true },
  });
  const out: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const day = addDaysISO(today, -w * 7);
    const at = new Date(`${day}T23:59:59-03:00`);
    out.push(
      rows.filter((r) => {
        const due = dateOnlyToISO(r.dueDate)!;
        if (due >= day || r.createdAt > at || r.status === "CANCELED") return false;
        return !r.completedAt || r.completedAt > at;
      }).length,
    );
  }
  return out;
}

async function doneTrend(ownerId: string, today: string, weeks = 8) {
  const since = new Date(`${addDaysISO(today, -weeks * 7)}T00:00:00-03:00`);
  const rows = await db.action.findMany({ where: { ownerId, deletedAt: null, completedAt: { gte: since } }, select: { completedAt: true } });
  const out: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(`${addDaysISO(today, -w * 7)}T23:59:59-03:00`);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    out.push(rows.filter((r) => r.completedAt! > start && r.completedAt! <= end).length);
  }
  return out;
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = todayISO();
  const dayStart = new Date(`${today}T00:00:00-03:00`);
  const dayEnd = new Date(`${today}T23:59:59-03:00`);

  const [open, doneToday, prioRows, events, health, inbox, trend, dTrend] = await Promise.all([
    getOpenActions(user.id),
    getRecentDone(user.id, today),
    db.dailyPriority.findMany({ where: { ownerId: user.id, date: isoToDateOnly(today)! }, orderBy: { position: "asc" } }),
    db.event.findMany({
      where: { ownerId: user.id, deletedAt: null, startsAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { startsAt: "asc" },
    }),
    getSectorHealth(user.id, user.id),
    getInboxCount(user.id),
    overdueTrend(user.id, today),
    doneTrend(user.id, today),
  ]);

  const prioIds = prioRows.map((p) => p.actionId);
  const known = new Map([...open, ...doneToday].map((a) => [a.id, a]));
  const missing = prioIds.filter((id) => !known.has(id));
  for (const a of await getActionsByIds(user.id, missing)) known.set(a.id, a);
  const priorities = prioIds.map((id) => known.get(id)).filter((a) => !!a);

  const fmt = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const now = nowTimeSP();
  const ev: TodayEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    start: fmt(e.startsAt),
    end: fmt(e.endsAt),
    sectorId: e.sectorId,
    recurring: !!e.rrule,
    past: fmt(e.endsAt) < now,
  }));

  return (
    <TodayView
      open={open}
      priorities={priorities}
      events={ev}
      now={now}
      health={health}
      inboxCount={inbox}
      overdueTrend={trend}
      doneTrend={dTrend}
    />
  );
}
