"use client";

// Gráfico do KPI (recharts), carregado só nas telas que mostram o gráfico.
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotProps } from "recharts";
import { useApp } from "@/components/app-provider";
import { STATUS_COLOR, STATUS_TEXT, alvoSymbol, fmtKpi, monthShort, statusOf, unitSuffix, type KpiStatus } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { KpiSnapshot } from "@/lib/data";

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
