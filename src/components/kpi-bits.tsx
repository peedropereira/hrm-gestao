"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotProps } from "recharts";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { SectorChip, Spark } from "@/components/ds";
import { saveKpi } from "@/app/actions/kpis";
import { Field, inputCls } from "@/app/(app)/setores/sector-forms";
import {
  KPI_TEMPLATES,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_TEXT,
  UNIT_CHOICES,
  alvoSymbol,
  fmtKpi,
  monthShort,
  statusOf,
  unitSuffix,
  type KpiDirection,
  type KpiStatus,
} from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { KpiSnapshot } from "@/lib/data";

export function StatusPill({ status, className }: { status: KpiStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", STATUS_TEXT[status], className)}>
      <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function useKpiStatus() {
  const { kpiRedPercent } = useApp();
  return (k: Pick<KpiSnapshot, "value" | "target" | "direction">) => statusOf(k.value, k.target, k.direction, kpiRedPercent);
}

/** Linha de meta: nome, valor grande, meta, status e mini gráfico. */
export function KpiRow({ k, showSector, month }: { k: KpiSnapshot; showSector?: boolean; month?: string }) {
  const { sectorById } = useApp();
  const st = useKpiStatus()(k);
  const stale = month && k.months.at(-1) !== month;
  return (
    <Link
      href={`/metas/${k.id}`}
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-line px-3.5 py-3 first:border-t-0 hover:bg-surface-2 md:px-4"
    >
      <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-fg-2 md:text-[13px]">
        <span className="truncate">{k.name}</span>
        {showSector && <SectorChip sector={sectorById(k.sectorId)} className="hidden text-[13px] sm:inline-flex md:text-[12px]" />}
      </span>
      <Spark values={k.series.slice(-12)} color={STATUS_COLOR[st]} width={96} height={40} className="row-span-3" />
      <span className={cn("text-[28px] font-bold leading-tight tracking-[-0.03em] md:text-[24px]", STATUS_TEXT[st])}>
        {fmtKpi(k.value, k.unit, true)}
        <small className="ml-0.5 text-[15px] font-semibold tracking-normal text-fg-3">{unitSuffix(k.unit)}</small>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] text-fg-3 md:text-[12px]">
        meta {alvoSymbol(k.direction)} {fmtKpi(k.target, k.unit, true)}
        {unitSuffix(k.unit)}
        <StatusPill status={st} />
        {k.months.at(-1) && <span>· {monthShort(k.months.at(-1)!)}</span>}
        {stale && <span className="font-semibold text-amber">· falta lançar</span>}
        {k.openActions > 0 && (
          <span>
            · {k.openActions} {k.openActions === 1 ? "ação" : "ações"}
          </span>
        )}
      </span>
    </Link>
  );
}

// ---------- gráfico ----------

type Point = { month: string; label: string; value: number | null; target: number; status: KpiStatus };

function StatusDot(props: DotProps & { payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload || payload.value === null) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill={STATUS_COLOR[payload.status]} stroke="var(--surface)" strokeWidth={2} />;
}

export function KpiChart({ k, months = 12, height = 260 }: { k: KpiSnapshot; months?: number; height?: number }) {
  const { kpiRedPercent } = useApp();
  const n = Math.min(months, k.series.length);
  const data: Point[] = k.series.slice(-n).map((v, i) => {
    const idx = k.series.length - n + i;
    const t = k.targets[idx] ?? k.target;
    return { month: k.months[idx], label: monthShort(k.months[idx]), value: v, target: t, status: statusOf(v, t, k.direction, kpiRedPercent) };
  });
  if (data.length === 0) return <p className="px-4 py-10 text-center text-[15px] text-fg-3">Sem valores lançados ainda.</p>;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--fg-3)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis
            tick={{ fill: "var(--fg-3)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => fmtKpi(v, k.unit, true)}
          />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload ? (payload[0].payload as Point) : null;
              if (!p) return null;
              return (
                <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow-sm)]">
                  <b className="block">{p.label}</b>
                  <span className={cn("font-semibold", STATUS_TEXT[p.status])}>
                    {fmtKpi(p.value, k.unit)}
                    {unitSuffix(k.unit)}
                  </span>
                  <span className="block text-fg-3">
                    meta {alvoSymbol(k.direction)} {fmtKpi(p.target, k.unit)}
                    {unitSuffix(k.unit)}
                  </span>
                </div>
              );
            }}
          />
          <Line type="stepAfter" dataKey="target" stroke="var(--fg-3)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} name="Meta" />
          <Line type="monotone" dataKey="value" stroke="var(--ac)" strokeWidth={2.5} dot={<StatusDot />} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} name="Realizado" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- cadastro ----------

export type KpiFormValue = {
  id?: string;
  name: string;
  sectorId: string;
  unit: string;
  direction: KpiDirection;
  target: string;
  source: string;
  template: string | null;
};

export function KpiForm({ open, onClose, initial, sectorId }: { open: boolean; onClose: () => void; initial?: KpiFormValue; sectorId?: string }) {
  const { sectors } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank: KpiFormValue = { name: "", sectorId: sectorId ?? "", unit: "%", direction: "HIGHER_BETTER", target: "", source: "", template: null };
  const [f, setF] = useState<KpiFormValue>(initial ?? blank);
  const set = <K extends keyof KpiFormValue>(k: K, v: KpiFormValue[K]) => setF((x) => ({ ...x, [k]: v }));
  const factory = sectors.filter((s) => s.active && !s.personal);

  const applyTemplate = (key: string) => {
    const t = KPI_TEMPLATES.find((x) => x.key === key);
    if (!t) return set("template", null);
    const sec = sectors.find((s) => s.slug === t.sectorSlug);
    setF((x) => ({ ...x, template: t.key, name: t.name, unit: t.unit, direction: t.direction, target: String(t.target).replace(".", ","), sectorId: x.sectorId || sec?.id || "" }));
  };

  const submit = () =>
    start(async () => {
      const target = Number(f.target.replace(/\./g, "").replace(",", "."));
      if (!f.target.trim() || Number.isNaN(target)) return void toast.error("Informe a meta (um número).");
      const r = await saveKpi({ name: f.name, sectorId: f.sectorId, unit: f.unit, direction: f.direction, target, source: f.source, template: f.template }, f.id);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
      toast.success(f.id ? "Meta atualizada" : "Meta criada");
      onClose();
      if (!f.id) router.push(`/metas/${r.data.id}`);
    });

  const tpl = KPI_TEMPLATES.find((t) => t.key === f.template);

  return (
    <Sheet open={open} onClose={onClose} title={f.id ? "Editar meta" : "Nova meta"} description={f.id ? undefined : "Comece por um modelo ou crie do zero."}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!f.id && (
          <Field label="Modelo" htmlFor="kpi-tpl" hint={tpl?.hint}>
            <select id="kpi-tpl" className={inputCls} value={f.template ?? ""} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">Meta personalizada</option>
              {KPI_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} ({t.unit})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Indicador" htmlFor="kpi-name">
          <input id="kpi-name" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="ex.: OTD, Horas de retrabalho" required />
        </Field>
        <Field label="Setor" htmlFor="kpi-sector">
          <select id="kpi-sector" className={inputCls} value={f.sectorId} onChange={(e) => set("sectorId", e.target.value)} required>
            <option value="" disabled>
              Escolha o setor
            </option>
            {factory.map((s) => (
              <option key={s.id} value={s.id}>
                {s.parentId ? `  ${s.name}` : s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidade" htmlFor="kpi-unit">
            <input id="kpi-unit" className={inputCls} list="kpi-units" value={f.unit} onChange={(e) => set("unit", e.target.value)} required />
            <datalist id="kpi-units">
              {UNIT_CHOICES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Meta" htmlFor="kpi-target">
            <input id="kpi-target" inputMode="decimal" className={inputCls} value={f.target} onChange={(e) => set("target", e.target.value)} placeholder="ex.: 95" required />
          </Field>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[15px] font-semibold md:text-[13px]">O que é melhor?</span>
          <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="Direção da meta">
            {(
              [
                ["HIGHER_BETTER", "Quanto maior, melhor"],
                ["LOWER_BETTER", "Quanto menor, melhor"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={f.direction === k}
                onClick={() => set("direction", k)}
                className={cn("h-11 rounded-[9px] text-[14px] font-semibold text-fg-2 md:h-9 md:text-[13px]", f.direction === k && "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--line)]")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Field label="Fonte (opcional)" htmlFor="kpi-source" hint="De onde vem o número: planilha, ERP, relatório…">
          <input id="kpi-source" className={inputCls} value={f.source} onChange={(e) => set("source", e.target.value)} />
        </Field>
        <Button type="submit" block disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {f.id ? "Salvar" : "Criar meta"}
        </Button>
      </form>
    </Sheet>
  );
}
