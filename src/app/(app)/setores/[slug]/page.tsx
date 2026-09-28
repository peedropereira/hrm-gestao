import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getKpiSnapshots, getOpenActions, getSectorHealth, getSectors } from "@/lib/data";
import { dateOnlyToISO, formatDateTimeShort } from "@/lib/dates";
import { SectorView } from "./sector-view";

export async function generateMetadata({ params }: PageProps<"/setores/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.charAt(0).toUpperCase() + slug.slice(1) };
}

export default async function SectorPage({ params, searchParams }: PageProps<"/setores/[slug]">) {
  const user = await requireUser();
  const { slug } = await params;
  const sp = await searchParams;
  const sectors = await getSectors(user.id);
  const sector = sectors.find((s) => s.slug === slug);
  if (!sector) notFound();
  const ids = [sector.id, ...sectors.filter((s) => s.parentId === sector.id).map((s) => s.id)];

  const [open, health, kpis, needs, demands, notes, activity] = await Promise.all([
    getOpenActions(user.id),
    getSectorHealth(user.id, user.id),
    getKpiSnapshots(user.id),
    db.need.findMany({ where: { ownerId: user.id, deletedAt: null, sectorId: { in: ids } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.demand.findMany({ where: { ownerId: user.id, deletedAt: null, sectorId: { in: ids } }, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }] }),
    db.note.findMany({ where: { ownerId: user.id, deletedAt: null, sectorId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.activityLog.findMany({ where: { ownerId: user.id, sectorId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  const tab = typeof sp.aba === "string" ? sp.aba : "resumo";
  return (
    <SectorView
      sector={sector}
      subIds={ids}
      tab={tab}
      health={health.find((h) => h.sectorId === sector.id) ?? null}
      actions={open.filter((a) => a.sectorId && ids.includes(a.sectorId))}
      kpis={kpis.filter((k) => ids.includes(k.sectorId))}
      needs={needs.map((n) => ({
        id: n.id,
        sectorId: n.sectorId,
        title: n.title,
        details: n.details,
        category: n.category,
        estimatedCost: n.estimatedCost === null ? null : Number(n.estimatedCost),
        recurring: n.recurring,
        priority: n.priority,
        status: n.status,
      }))}
      demands={demands.map((d) => ({
        id: d.id,
        sectorId: d.sectorId,
        title: d.title,
        details: d.details,
        source: d.source,
        receivedAt: dateOnlyToISO(d.receivedAt)!,
        dueDate: dateOnlyToISO(d.dueDate),
        priority: d.priority,
        status: d.status,
      }))}
      notes={notes.map((n) => ({ id: n.id, content: n.content, createdAt: formatDateTimeShort(n.createdAt) }))}
      timeline={activity.map((a) => ({ id: a.id, summary: a.summary, at: formatDateTimeShort(a.createdAt) }))}
    />
  );
}
