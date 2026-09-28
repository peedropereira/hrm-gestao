import "server-only";
import { db } from "@/lib/db";
import type { EventOptions } from "@/components/event-form";

/** Demandas e ações abertas para vincular a um compromisso. */
export async function getEventOptions(ownerId: string): Promise<EventOptions> {
  const [demands, actions] = await Promise.all([
    db.demand.findMany({
      where: { ownerId, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true, title: true, sectorId: true },
      orderBy: { title: "asc" },
      take: 300,
    }),
    db.action.findMany({
      where: { ownerId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } },
      select: { id: true, title: true, sectorId: true },
      orderBy: { title: "asc" },
      take: 400,
    }),
  ]);
  return { demands, actions };
}
