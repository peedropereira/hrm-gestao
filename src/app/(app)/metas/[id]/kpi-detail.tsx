"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowDownRight, ArrowUpRight, Loader2, Minus, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Card, DueBadge, PanelHead, PersonChip, SectorChip } from "@/components/ds";
import { CheckButton } from "@/components/action-bits";
import { Button } from "@/components/button";
import { KpiChart, KpiForm, StatusPill, useKpiStatus } from "@/components/kpi-bits";
import { archiveKpi, saveKpiEntries } from "@/app/actions/kpis";
import { createAction } from "@/app/actions/actions";
import { parseNL } from "@/lib/nl-parse";
import { STATUS_TEXT, alvoSymbol, fmtKpi, monthLong, monthShort, parseNumBR, statusOf, toInputBR, unitSuffix } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { KpiSnapshot } from "@/lib/data";
import type { ActionDTO } from "@/lib/types";

type Props = {
  k: KpiSnapshot;
  template: string | null;
  monthTargets: Record<string, number | null>;
  launch: string;
  actions: ActionDTO[];
};

const PERIODS = [6, 12, 24] as const;

export function KpiDetail({ k, template, monthTargets, launch, actions }: Props) {
  const { today, people, sectors, sectorById, personById, kpiRedPercent } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(12);
  const [editing, setEditing] = useState(false);
  const [quick, setQuick] = useState("");
  const st = useKpiStatus()(k);

  // meses editáveis: os últimos 12 com valor + o mês de lançamento (se faltar)
  const rowsMonths = useMemo(() => {
    const set = new Set(k.months.slice(-12));
    set.add(launch);
    return [...set].sort().reverse();
  }, [k.months, launch]);
  const valueOf = (m: string) => {
    const i = k.months.indexOf(m);
    return i >= 0 ? k.series[i] : null;
  };
  const [draft, setDraft] = useState<Record<string, { value: string; target: string }>>({});
  const dirty = Object.keys(draft);

  const cell = (m: string) => draft[m] ?? { value: toInputBR(valueOf(m)), target: toInputBR(monthTargets[m]) };
  const edit = (m: string, field: "value" | "target", v: string) => setDraft((d) => ({ ...d, [m]: { ...cell(m), [field]: v } }));

  const saveRows = () =>
    start(async () => {
      const entries = [];
      for (const m of dirty) {
        const value = parseNumBR(draft[m].value);
        const target = parseNumBR(draft[m].target);
        if (Number.isNaN(value) || Number.isNaN(target)) return void toast.error(`Número inválido em ${monthShort(m)}.`);
        entries.push({ month: m, value, target });
      }
      const r = await saveKpiEntries(k.id, entries);
      if (!r.ok) return void toast.error(r.error);
      setDraft({});
      toast.success("Valores salvos");
      router.refresh();
    });

  // números de apoio
  const n = k.series.length;
  const prev = n > 1 ? k.series[n - 2] : null;
  const delta = k.value !== null && prev !== null ? k.value - prev : null;
  const better = delta === null || delta === 0 ? null : (delta > 0) === (k.direction === "HIGHER_BETTER");
  const avg3 = n ? k.series.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, n) : null;
  const best = n ? (k.direction === "HIGHER_BETTER" ? Math.max(...k.series.slice(-12)) : Math.min(...k.series.slice(-12))) : null;
  const inTarget12 = k.series.slice(-12).filter((v, i) => statusOf(v, k.targets[Math.max(0, n - 12) + i] ?? k.target, k.direction, kpiRedPercent) === "green").length;

  const createFromKpi = () =>
    start(async () => {
      const r0 = parseNL(quick, { today, people, sectors });
      const r = await createAction({
        title: r0.title || quick.trim(),
        kind: r0.kind,
        assigneeId: r0.assigneeId,
        sectorId: r0.sectorId ?? k.sectorId,
        dueDate: r0.dueDate,
        urgent: r0.urgent,
        important: r0.important,
        origin: "KPI",
        originNote: `Meta: ${k.name}`,
        kpiId: k.id,
      });
      if (!r.ok) return void toast.error(r.error);
      setQuick("");
      toast.success("Ação criada para a meta");
      router.refresh();
    });

  const archive = () =>
    start(async () => {
      const r = await archiveKpi(k.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Meta arquivada", { action: { label: "Desfazer", onClick: () => void archiveKpi(k.id, true).then(() => router.push(`/metas/${k.id}`)) } });
      router.push("/metas");
    });

  const Trend = better === null ? Minus : (delta ?? 0) > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-0">
      {/* Cabeçalho */}
      <header className="grid gap-2 pt-1">
        <SectorChip sector={sectorById(k.sectorId)} />
        <h1 className="text-balance text-[26px] font-bold leading-tight tracking-[-0.02em] md:text-[24px]">{k.name}</h1>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className={cn("text-[44px] font-bold leading-none tracking-[-0.035em] md:text-[40px]", STATUS_TEXT[st])}>
            {fmtKpi(k.value, k.unit)}
            <small className="ml-1 text-[18px] font-semibold tracking-normal text-fg-3">{unitSuffix(k.unit)}</small>
          </span>
          <span className="pb-1 text-[15px] text-fg-2 md:text-[14px]">
            meta {alvoSymbol(k.direction)} {fmtKpi(k.target, k.unit)}
            {unitSuffix(k.unit)} {k.month && <>· {monthShort(k.month.slice(0, 7))}</>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-fg-3">
          <StatusPill status={st} className="text-[14px]" />
          {k.offPct > 0 && <span>{k.offPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% fora da meta</span>}
          {k.source && <span>· Fonte: {k.source}</span>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => setEditing(true)}>
            <Pencil /> Editar
          </Button>
          <Button variant="quiet" size="sm" className="h-11 md:h-9" disabled={pending} onClick={archive}>
            <Archive /> Arquivar
          </Button>
        </div>
      </header>

      {/* Números de apoio */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[
          [
            "Mês anterior",
            prev === null ? "—" : `${fmtKpi(prev, k.unit, true)}${unitSuffix(k.unit)}`,
            delta === null ? null : (
              <span className={cn("inline-flex items-center gap-0.5", better === null ? "text-fg-3" : better ? "text-green" : "text-red")}>
                <Trend className="size-4" />
                {fmtKpi(Math.abs(delta), k.unit, true)}
                {unitSuffix(k.unit)}
              </span>
            ),
          ],
          ["Média 3 meses", avg3 === null ? "—" : `${fmtKpi(avg3, k.unit, true)}${unitSuffix(k.unit)}`, null],
          ["Melhor em 12 meses", best === null ? "—" : `${fmtKpi(best, k.unit, true)}${unitSuffix(k.unit)}`, null],
          ["No alvo em 12 meses", n ? `${inTarget12} de ${Math.min(12, n)}` : "—", null],
        ].map(([label, v, extra], i) => (
          <Card key={i} className="grid gap-0.5 px-3.5 py-3">
            <span className="text-[13px] font-medium text-fg-3">{label}</span>
            <b className="text-[20px] font-bold tracking-[-0.02em] md:text-[18px]">{v}</b>
            {extra && <span className="text-[13px] font-semibold">{extra}</span>}
          </Card>
        ))}
      </div>

      {/* Gráfico */}
      <Card>
        <PanelHead title="Tendência">
          <div className="flex gap-1 rounded-[10px] bg-surface-2 p-0.5" role="radiogroup" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={cn("h-8 rounded-[8px] px-2.5 text-[13px] font-semibold text-fg-2", period === p && "bg-surface text-fg shadow-[var(--shadow-sm)]")}
              >
                {p}m
              </button>
            ))}
          </div>
        </PanelHead>
        <div className="px-2 pb-3 pt-2">
          <KpiChart k={k} months={period} />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-1 text-[13px] text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded bg-ac" /> Realizado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed border-fg-3" /> Meta
            </span>
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Lançamentos */}
        <Card>
          <PanelHead title="Resultados por mês">
            {dirty.length > 0 && <span className="text-[13px] font-medium text-amber">não salvo</span>}
          </PanelHead>
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-2 border-b border-line bg-surface-2 px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.05em] text-fg-3">
            <span>Mês</span>
            <span>Realizado</span>
            <span>Meta do mês</span>
          </div>
          <ul>
            {rowsMonths.map((m) => {
              const c = cell(m);
              const v = parseNumBR(c.value);
              const t = parseNumBR(c.target) ?? k.baseTarget;
              const s = v === null || Number.isNaN(v) ? "none" : statusOf(v, Number.isNaN(t) ? k.baseTarget : t, k.direction, kpiRedPercent);
              return (
                <li key={m} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-x-2 border-t border-line px-3.5 py-1.5 first:border-t-0">
                  <span className="text-[15px] font-medium md:text-[14px]">
                    {monthShort(m)}
                    {m === launch && valueOf(m) === null && <span className="ml-1.5 text-[12px] font-semibold text-amber">lançar</span>}
                  </span>
                  <label className="sr-only" htmlFor={`v-${m}`}>
                    Realizado em {monthLong(m)}
                  </label>
                  <input
                    id={`v-${m}`}
                    inputMode="decimal"
                    value={c.value}
                    onChange={(e) => edit(m, "value", e.target.value)}
                    placeholder="—"
                    className={cn(
                      "h-11 w-full min-w-0 rounded-[10px] border border-line bg-bg px-2.5 text-[16px] font-semibold outline-none focus:border-ac md:h-9 md:text-[14px]",
                      s !== "none" && STATUS_TEXT[s],
                    )}
                  />
                  <label className="sr-only" htmlFor={`t-${m}`}>
                    Meta em {monthLong(m)}
                  </label>
                  <input
                    id={`t-${m}`}
                    inputMode="decimal"
                    value={c.target}
                    onChange={(e) => edit(m, "target", e.target.value)}
                    placeholder={toInputBR(k.baseTarget)}
                    className="h-11 w-full min-w-0 rounded-[10px] border border-line bg-bg px-2.5 text-[16px] outline-none placeholder:text-fg-3 focus:border-ac md:h-9 md:text-[14px]"
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3">
            <span className="text-[13px] text-fg-3">Meta do mês vazia = meta padrão. Apague o valor para remover o mês.</span>
            <Button size="sm" className="h-11 md:h-9" disabled={!dirty.length || pending} onClick={saveRows}>
              {pending && <Loader2 className="animate-spin" />} Salvar valores
            </Button>
          </div>
          {k.months.length > 12 && (
            <p className="border-t border-line px-3.5 py-2 text-[13px] text-fg-3">
              Mostrando os últimos 12 meses. Histórico desde {monthShort(k.months[0])}.
            </p>
          )}
        </Card>

        {/* Ações da meta */}
        <Card>
          <PanelHead title="Ações para esta meta" count={actions.filter((a) => a.status !== "DONE").length} />
          {actions.length === 0 && <p className="px-4 py-4 text-[15px] text-fg-3 md:text-[14px]">{st === "red" || st === "amber" ? "A meta está fora do alvo. Registre o que vai ser feito." : "Nenhuma ação ligada a esta meta."}</p>}
          <ul>
            {actions.map((a) => (
              <li key={a.id} className="flex items-start gap-1 border-t border-line py-1.5 pl-1 pr-3.5 first:border-t-0 md:items-center">
                <CheckButton a={a} />
                <Link href={`/acoes/${a.id}`} className="min-w-0 flex-1 py-2">
                  <span className={cn("block text-[16px] font-medium leading-snug md:text-[14px]", a.status === "DONE" && "text-fg-3 line-through")}>{a.title}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <DueBadge a={a} today={today} />
                    <PersonChip person={personById(a.assigneeId)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (quick.trim()) createFromKpi();
            }}
          >
            <label htmlFor="kpi-action" className="sr-only">
              Nova ação para a meta
            </label>
            <input
              id="kpi-action"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="ex.: levantar causas do retrabalho com Anderson sexta"
              className="h-12 min-w-0 flex-1 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac md:h-10 md:text-[14px]"
            />
            <Button type="submit" size="sm" className="h-12 md:h-10" disabled={pending || !quick.trim()} aria-label="Criar ação">
              <Plus />
            </Button>
          </form>
        </Card>
      </div>

      {editing && (
        <KpiForm
          open
          onClose={() => setEditing(false)}
          initial={{ id: k.id, name: k.name, sectorId: k.sectorId, unit: k.unit, direction: k.direction, target: toInputBR(k.baseTarget), source: k.source ?? "", template }}
        />
      )}
    </div>
  );
}
