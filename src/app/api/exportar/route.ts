import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/dates";

// Backup completo em JSON (sem a senha).
export async function GET() {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const where = { ownerId };
  const [sectors, people, actions, demands, needs, notes, tags, kpis, events, inbox, priorities, activity] = await Promise.all([
    db.sector.findMany({ where }),
    db.person.findMany({ where }),
    db.action.findMany({ where, include: { subtasks: true, updates: { include: { attachments: true } }, tags: { select: { name: true } } } }),
    db.demand.findMany({ where, include: { tags: { select: { name: true } } } }),
    db.need.findMany({ where, include: { tags: { select: { name: true } } } }),
    db.note.findMany({ where, include: { tags: { select: { name: true } } } }),
    db.tag.findMany({ where }),
    db.kpi.findMany({ where, include: { entries: true } }),
    db.event.findMany({ where }),
    db.inboxItem.findMany({ where }),
    db.dailyPriority.findMany({ where }),
    db.activityLog.findMany({ where }),
  ]);

  const body = JSON.stringify(
    { app: "HRM Gestão", version: 1, exportedAt: new Date().toISOString(), sectors, people, actions, demands, needs, notes, tags, kpis, events, inbox, priorities, activity },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hrm-gestao-backup-${todayISO()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
