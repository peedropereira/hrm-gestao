import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { businessDaysBetween, dateOnlyToISO, diffDays, todayISO } from "@/lib/dates";
import type { ActionDTO, PersonDTO, SectorDTO, SectorHealth } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";

export const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "WAITING"] as const;

const actionInclude = {
  subtasks: { select: { done: true } },
  tags: { select: { name: true } },
} satisfies Prisma.ActionInclude;

type ActionRow = Prisma.ActionGetPayload<{ include: typeof actionInclude }>;

export function toActionDTO(a: ActionRow): ActionDTO {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    sectorId: a.sectorId,
    assigneeId: a.assigneeId,
    kind: a.kind,
    origin: a.origin,
    originNote: a.originNote,
    eventId: a.eventId,
    dueDate: dateOnlyToISO(a.dueDate),
    urgent: a.urgent,
    important: a.important,
    status: a.status,
    completedAt: a.completedAt?.toISOString() ?? null,
    lastFollowUpAt: a.lastFollowUpAt ? todayISO(a.lastFollowUpAt) : null,
    createdAt: a.createdAt.toISOString(),
    alertAfterDays: a.alertAfterDays,
    subtasksDone: a.subtasks.filter((s) => s.done).length,
    subtasksTotal: a.subtasks.length,
    tags: a.tags.map((t) => t.name),
  };
}

export const getSectors = cache(async (ownerId: string): Promise<SectorDTO[]> => {
  const rows = await db.sector.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, shortName: true, slug: true, color: true, icon: true, parentId: true, order: true, active: true, personal: true },
  });
  return rows;
});

export const getPeople = cache(async (ownerId: string): Promise<PersonDTO[]> => {
  return db.person.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, phone: true, whatsapp: true, email: true, sectorId: true, isLeader: true },
  });
});

export const getSettings = cache(async (userId: string) => {
  return (
    (await db.userSettings.findUnique({ where: { userId } })) ?? {
      userId,
      redOverdueMin: 2,
      kpiRedPercent: 10,
      delegateAlertDays: 3,
    }
  );
});

/** Todas as ações abertas (a lista pessoal raramente passa de algumas centenas). */
export const getOpenActions = cache(async (ownerId: string): Promise<ActionDTO[]> => {
  const rows = await db.action.findMany({
    where: { ownerId, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
    include: actionInclude,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return rows.map(toActionDTO);
});

export async function getRecentDone(ownerId: string, sinceISO: string, take = 50): Promise<ActionDTO[]> {
  const rows = await db.action.findMany({
    where: { ownerId, deletedAt: null, status: "DONE", completedAt: { gte: new Date(`${sinceISO}T03:00:00Z`) } },
    include: actionInclude,
    orderBy: { completedAt: "desc" },
    take,
  });
  return rows.map(toActionDTO);
}

export async function getActionsByIds(ownerId: string, ids: string[]): Promise<ActionDTO[]> {
  if (!ids.length) return [];
  const rows = await db.action.findMany({ where: { ownerId, id: { in: ids }, deletedAt: null }, include: actionInclude });
  return rows.map(toActionDTO);
}

export function isOverdue(a: ActionDTO, today: string) {
  return a.status !== "DONE" && a.status !== "CANCELED" && !!a.dueDate && a.dueDate < today;
}

/** Ação delegada/cobrada sem follow-up há mais que o limite (dias úteis). */
export function followUpLate(a: ActionDTO, today: string, defaultDays: number) {
  if (!a.assigneeId || a.status === "DONE" || a.status === "CANCELED") return false;
  const since = a.lastFollowUpAt ?? a.createdAt.slice(0, 10);
  return businessDaysBetween(since, today) > (a.alertAfterDays ?? defaultDays);
}

export function daysSince(iso: string, today: string) {
  return diffDays(iso, today);
}

export const getInboxCount = cache(async (ownerId: string) =>
  db.inboxItem.count({ where: { ownerId, status: "PENDING" } }),
);

/** Último valor de cada meta, para o semáforo e para as páginas de setor. */
export async function getKpiSnapshots(ownerId: string, sectorId?: string) {
  const kpis = await db.kpi.findMany({
    where: { ownerId, deletedAt: null, active: true, ...(sectorId ? { sectorId } : {}) },
    include: { entries: { orderBy: { month: "desc" }, take: 12 } },
    orderBy: { name: "asc" },
  });
  return kpis.map((k) => {
    const entries = [...k.entries].reverse();
    const last = entries.at(-1);
    const target = Number(last?.target ?? k.target);
    const value = last ? Number(last.value) : null;
    let offPct = 0;
    if (value !== null && target !== 0) {
      if (k.direction === "LOWER_BETTER" && value > target) offPct = ((value - target) / Math.abs(target)) * 100;
      if (k.direction === "HIGHER_BETTER" && value < target) offPct = ((target - value) / Math.abs(target)) * 100;
    } else if (value !== null && target === 0 && k.direction === "LOWER_BETTER" && value > 0) {
      offPct = 100;
    }
    return {
      id: k.id,
      sectorId: k.sectorId,
      name: k.name,
      unit: k.unit,
      direction: k.direction,
      target,
      source: k.source,
      value,
      month: last ? dateOnlyToISO(last.month) : null,
      offPct,
      series: entries.map((e) => Number(e.value)),
      months: entries.map((e) => dateOnlyToISO(e.month)!),
    };
  });
}
export type KpiSnapshot = Awaited<ReturnType<typeof getKpiSnapshots>>[number];

export function formatKpiValue(v: number | null, unit: string) {
  if (v === null) return "—";
  const n = v.toLocaleString("pt-BR", { maximumFractionDigits: unit === "%" ? 1 : 2 });
  if (unit === "R$") return `R$ ${n}`;
  return n;
}

/** Semáforo por setor (subsetores somam no setor pai). */
export async function getSectorHealth(ownerId: string, userId: string): Promise<SectorHealth[]> {
  const today = todayISO();
  const [sectors, actions, kpis, settings] = await Promise.all([
    getSectors(ownerId),
    getOpenActions(ownerId),
    getKpiSnapshots(ownerId),
    getSettings(userId),
  ]);
  const rootOf = new Map<string, string>();
  for (const s of sectors) rootOf.set(s.id, s.parentId ?? s.id);

  return sectors
    .filter((s) => !s.parentId && s.active && !s.personal)
    .map((s) => {
      const mine = actions.filter((a) => a.sectorId && rootOf.get(a.sectorId) === s.id);
      const overdue = mine.filter((a) => isOverdue(a, today)).length;
      const offKpis = kpis.filter((k) => rootOf.get(k.sectorId) === s.id && k.offPct > 0);
      const worst = offKpis.sort((a, b) => b.offPct - a.offPct)[0];

      let status: SectorHealth["status"] = "green";
      if (overdue >= settings.redOverdueMin || (worst && worst.offPct > settings.kpiRedPercent)) status = "red";
      else if (overdue >= 1 || worst) status = "amber";

      const parts: string[] = [];
      if (overdue) parts.push(`${overdue} ${overdue === 1 ? "ação atrasada" : "ações atrasadas"}`);
      if (worst) {
        const alvo = worst.direction === "LOWER_BETTER" ? "≤" : "≥";
        parts.push(
          `${worst.name} ${formatKpiValue(worst.value, worst.unit)}${worst.unit === "%" ? "%" : ""} (meta ${alvo} ${formatKpiValue(worst.target, worst.unit)}${worst.unit === "%" ? "%" : ""})`,
        );
      }
      return {
        sectorId: s.id,
        status,
        reason: parts.join(" · ") || "Em dia",
        overdue,
        open: mine.length,
      };
    });
}
