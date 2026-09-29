import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getActionsByIds } from "@/lib/data";
import { dateOnlyToISO, todayISO } from "@/lib/dates";
import { launchMonth, offPercent } from "@/lib/kpi";
import { KpiDetail } from "./kpi-detail";

export const metadata: Metadata = { title: "Meta" };

export default async function KpiPage({ params }: PageProps<"/metas/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const k = await db.kpi.findFirst({
    where: { id, ownerId: user.id, deletedAt: null },
    include: { entries: { orderBy: { month: "asc" } } },
  });
  if (!k) notFound();
  const actionIds = (await db.action.findMany({ where: { ownerId: user.id, kpiId: k.id, deletedAt: null }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 50 })).map((a) => a.id);
  const actions = await getActionsByIds(user.id, actionIds);

  const last = k.entries.at(-1);
  const target = Number(last?.target ?? k.target);
  const value = last ? Number(last.value) : null;
  const snapshot = {
    id: k.id,
    sectorId: k.sectorId,
    name: k.name,
    unit: k.unit,
    direction: k.direction,
    target,
    baseTarget: Number(k.target),
    source: k.source,
    value,
    month: last ? dateOnlyToISO(last.month) : null,
    offPct: offPercent(value, target, k.direction),
    series: k.entries.map((e) => Number(e.value)),
    targets: k.entries.map((e) => Number(e.target ?? k.target)),
    months: k.entries.map((e) => dateOnlyToISO(e.month)!.slice(0, 7)),
    openActions: actions.filter((a) => a.status !== "DONE" && a.status !== "CANCELED").length,
  };
  const monthTargets = Object.fromEntries(k.entries.map((e) => [dateOnlyToISO(e.month)!.slice(0, 7), e.target === null ? null : Number(e.target)]));

  return (
    <div className="mx-auto max-w-[980px] md:px-7 md:pt-6">
      <div className="px-2 pt-1 md:px-0">
        <Link href="/metas" className="inline-flex h-11 items-center gap-0.5 px-2 text-[17px] font-medium text-ac-text md:px-0 md:text-[14px]">
          <ChevronLeft className="size-[22px] md:size-4" /> Metas
        </Link>
      </div>
      <KpiDetail
        k={snapshot}
        template={k.template}
        monthTargets={monthTargets}
        launch={launchMonth(todayISO())}
        actions={actions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
      />
    </div>
  );
}
