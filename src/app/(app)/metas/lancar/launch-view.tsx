"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Card, EmptyState, PanelHead, SectorTile } from "@/components/ds";
import { Button } from "@/components/button";
import { saveMonth } from "@/app/actions/kpis";
import { STATUS_TEXT, addMonths, alvoSymbol, fmtKpi, monthLong, monthShort, parseNumBR, statusOf, toInputBR, unitSuffix } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { KpiSnapshot } from "@/lib/data";

export function LaunchView({ kpis, month }: { kpis: KpiSnapshot[]; month: string }) {
  const { sectors, kpiRedPercent } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const valueIn = (k: KpiSnapshot, m: string) => {
    const i = k.months.indexOf(m);
    return i >= 0 ? k.series[i] : null;
  };
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(kpis.map((k) => [k.id, toInputBR(valueIn(k, month))])));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const filled = kpis.filter((k) => vals[k.id]?.trim()).length;

  const rootOf = (id: string) => sectors.find((x) => x.id === id)?.parentId ?? id;
  const groups = sectors
    .filter((s) => !s.parentId && !s.personal)
    .map((s) => ({ s, items: kpis.filter((k) => rootOf(k.sectorId) === s.id) }))
    .filter((g) => g.items.length);

  const save = () =>
    start(async () => {
      const list = [];
      for (const id of touched) {
        const v = parseNumBR(vals[id] ?? "");
        if (Number.isNaN(v)) return void toast.error(`Número inválido em “${kpis.find((k) => k.id === id)?.name}”.`);
        list.push({ kpiId: id, value: v });
      }
      if (!list.length) return void toast("Nada foi alterado.");
      const r = await saveMonth(month, list);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${monthLong(month)}: ${r.data?.saved ?? 0} ${r.data?.saved === 1 ? "resultado salvo" : "resultados salvos"}`);
      setTouched(new Set());
      router.push("/metas");
    });

  const go = (n: number) => router.replace(`/metas/lancar?mes=${addMonths(month, n)}`);

  return (
    <div className="grid gap-4 px-4 pb-28 md:px-0 md:pb-8">
      <header className="grid gap-2">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] md:text-[24px]">Lançar resultados</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" className="md:size-9" aria-label="Mês anterior" onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
          <b className="min-w-[180px] text-center text-[18px] md:text-[16px]">{monthLong(month)}</b>
          <Button variant="secondary" size="icon" className="md:size-9" aria-label="Próximo mês" onClick={() => go(1)}>
            <ChevronRight />
          </Button>
          <span className="ml-auto text-[14px] text-fg-3">
            {filled} de {kpis.length}
          </span>
        </div>
        <p className="text-[14px] text-fg-3">Digite o realizado do mês de cada indicador. Deixe em branco o que ainda não tem.</p>
      </header>

      {kpis.length === 0 && <EmptyState title="Nenhuma meta cadastrada">Crie as metas primeiro na página Metas.</EmptyState>}

      {groups.map(({ s, items }) => (
        <Card key={s.id}>
          <PanelHead
            title={
              <span className="flex items-center gap-2">
                <SectorTile sector={s} size={22} /> {s.name}
              </span>
            }
          />
          <ul>
            {items.map((k) => {
              const v = parseNumBR(vals[k.id] ?? "");
              const st = v === null || Number.isNaN(v) ? "none" : statusOf(v, k.target, k.direction, kpiRedPercent);
              const prev = valueIn(k, addMonths(month, -1));
              return (
                <li key={k.id} className="grid grid-cols-[1fr_128px] items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0 md:grid-cols-[1fr_150px] md:px-4">
                  <label htmlFor={`l-${k.id}`} className="min-w-0">
                    <b className="block text-[16px] font-semibold md:text-[14px]">{k.name}</b>
                    <span className="block text-[13px] text-fg-3">
                      meta {alvoSymbol(k.direction)} {fmtKpi(k.target, k.unit, true)}
                      {unitSuffix(k.unit)}
                      {prev !== null && (
                        <>
                          {" "}
                          · {monthShort(addMonths(month, -1))}: {fmtKpi(prev, k.unit, true)}
                          {unitSuffix(k.unit)}
                        </>
                      )}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id={`l-${k.id}`}
                      inputMode="decimal"
                      enterKeyHint="next"
                      value={vals[k.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVals((x) => ({ ...x, [k.id]: val }));
                        setTouched((t) => new Set(t).add(k.id));
                      }}
                      placeholder="—"
                      className={cn(
                        "h-12 w-full rounded-[12px] border border-line-strong bg-bg py-0 pl-3 pr-12 text-right text-[18px] font-semibold outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[15px]",
                        st !== "none" && STATUS_TEXT[st],
                      )}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 max-w-[42px] -translate-y-1/2 truncate text-[12px] text-fg-3">{k.unit}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {kpis.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button block disabled={pending || touched.size === 0} onClick={save}>
            {pending && <Loader2 className="animate-spin" />}
            Salvar {touched.size > 0 ? `${touched.size} ${touched.size === 1 ? "resultado" : "resultados"}` : "resultados"}
          </Button>
        </div>
      )}
    </div>
  );
}
