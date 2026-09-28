import "server-only";
import { db } from "@/lib/db";
import type { ActionExtra } from "@/lib/types";

/** Subações e histórico de uma ação (carregados à parte da lista). */
export async function loadActionExtra(ownerId: string, id: string): Promise<ActionExtra | null> {
  const a = await db.action.findFirst({
    where: { id, ownerId },
    select: {
      subtasks: { orderBy: { order: "asc" }, select: { id: true, title: true, done: true } },
      updates: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, kind: true, text: true, createdAt: true, attachments: { select: { id: true, url: true, mimeType: true } } },
      },
    },
  });
  if (!a) return null;
  return { subtasks: a.subtasks, updates: a.updates.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })) };
}
