"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardPen, Plus } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Card, EmptyState, PanelHead, SectorTile } from "@/components/ds";
import { Button } from "@/components/button";
import { KpiForm, KpiRow, useKpiStatus } from "@/components/kpi-bits";
import { monthLong } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { KpiSnapshot } from "@/lib/data";

const FILTERS = [
  ["todas", "Todas"],
  ["fora", "Fora do alvo"],
  ["lancar", "Falta lançar"],
] as const;

export function MetasView({ kpis, month, filter }: { kpis: KpiSnapshot[]; month: string; filter: string }) {
  const { sectors } = useApp();
  const router = useRouter();
  const path = usePathname();
  const statusOf = useKpiStatus();
  const [creating, setCreating] = useState(false);

  const withStatus = kpis.map((k) => ({ k, st: statusOf(k), missing: k.months.at(-1) !== month }));
  const counts = {
    red: withStatus.filter((x) => x.st === "red").length,
    amber: withStatus.filter((x) => x.st === "amber").length,
    green: withStatus.filter((x) => x.st === "green").length,
    missing: withStatus.filter((x) => x.missing).length,
  };
  const shown = withStatus.filter((x) => (filter === "fora" ? x.st === "red" || x.st === "amber" : filter === "lancar" ? x.missing : true));

  // agrupa pelo setor principal
  const rootOf = (id: string) => {
    const s = sectors.find((x) => x.id === id);
    return s?.parentId ?? id;
  };
  const groups = sectors
    .filter((s) => !s.parentId && !s.personal)
    .map((s) => ({ s, items: shown.filter((x) => rootOf(x.k.sectorId) === s.id) }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.items.filter((x) => x.st === "red").length - a.items.filter((x) => x.st === "red").length || a.s.order - b.s.order);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-3 md:px-7 md:pt-6">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Metas</h1>
          <p className="text-[15px] font-medium text-fg-3 md:text-[14px]">
            <span className="text-red">{counts.red} fora do alvo</span> · <span className="text-amber">{counts.amber} perto do limite</span> · {counts.green} no alvo
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => setCreating(true)}>
            <Plus /> Nova meta
          </Button>
          <Link
            href={`/metas/lancar?mes=${month}`}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-ac px-3.5 text-[15px] font-semibold text-ac-fg hover:bg-ac-hover md:h-9 md:text-[13px] [&_svg]:size-[17px]"
          >
            <ClipboardPen /> Lançar {monthLong(month).split(" ")[0].toLowerCase()}
          </Link>
        </div>
      </header>

      {counts.missing > 0 && kpis.length > 0 && (
        <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-amber-bg px-4 py-3 text-[15px] md:mx-7 md:text-[14px]">
          <span>
            <b>{counts.missing}</b> {counts.missing === 1 ? "meta ainda sem" : "metas ainda sem"} resultado de {monthLong(month).toLowerCase()}.
          </span>
          <Link href={`/metas/lancar?mes=${month}`} className="font-semibold text-amber underline-offset-2 hover:underline">
            Lançar agora
          </Link>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 md:px-7" role="tablist" aria-label="Filtro">
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => router.replace(k === "todas" ? path : `${path}?f=${k}`, { scroll: false })}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-[15px] font-semibold md:h-8 md:text-[13px]",
              filter === k ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-2",
            )}
          >
            {l}
            {k === "fora" && counts.red + counts.amber > 0 && <span className="ml-1.5 opacity-70">{counts.red + counts.amber}</span>}
            {k === "lancar" && counts.missing > 0 && <span className="ml-1.5 opacity-70">{counts.missing}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-3 px-4 pb-6 md:grid-cols-2 md:px-7 [&>*]:min-w-0">
        {kpis.length === 0 ? (
          <EmptyState title="Nenhuma meta cadastrada" className="md:col-span-2">
            <p>Crie a partir dos 11 modelos (OTD, retrabalho, refugo…) ou de um indicador próprio.</p>
            <Button className="mt-3" onClick={() => setCreating(true)}>
              <Plus /> Nova meta
            </Button>
          </EmptyState>
        ) : groups.length === 0 ? (
          <EmptyState title="Nada neste filtro" className="md:col-span-2">
            {filter === "lancar" ? "Todas as metas já têm o resultado do mês." : "Todas as metas estão no alvo."}
          </EmptyState>
        ) : (
          groups.map(({ s, items }) => (
            <Card key={s.id}>
              <PanelHead
                title={
                  <Link href={`/setores/${s.slug}?aba=metas`} className="flex items-center gap-2 hover:underline">
                    <SectorTile sector={s} size={22} /> {s.name}
                  </Link>
                }
                count={items.length}
              />
              {items.map(({ k }) => (
                <KpiRow key={k.id} k={k} month={month} />
              ))}
            </Card>
          ))
        )}
      </div>

      {creating && <KpiForm open onClose={() => setCreating(false)} />}
    </div>
  );
}
