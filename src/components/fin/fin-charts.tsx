"use client";

// Gráficos das finanças (recharts). Carregados sob demanda pelas telas.
import type { ReactNode } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

const axis = { fill: "var(--fg-3)", fontSize: 12 };
const money = (v: number) => brl(v, { compact: true }).replace(",00", "");

function Tip({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-[150px] rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow-sm)]">
      <b className="mb-0.5 block">{title}</b>
      {children}
    </div>
  );
}
const Row = ({ color, label, value, strong }: { color?: string; label: string; value: string; strong?: boolean }) => (
  <span className={cn("flex items-center justify-between gap-3", strong && "font-semibold")}>
    <span className="inline-flex items-center gap-1.5">
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {label}
    </span>
    <span className="tabular-nums">{value}</span>
  </span>
);

/** Receitas × despesas por mês, com a linha do resultado. */
export function CashflowChart({ data, height = 260 }: { data: { label: string; income: number; expense: number; result: number }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={money} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload ? (payload[0].payload as (typeof data)[number]) : null;
              if (!p) return null;
              return (
                <Tip title={p.label}>
                  <Row color="var(--green-solid)" label="Receitas" value={brl(p.income)} />
                  <Row color="var(--ac)" label="Despesas" value={brl(p.expense)} />
                  <Row label="Resultado" value={brl(p.result, { sign: true })} strong />
                </Tip>
              );
            }}
          />
          <Bar dataKey="income" fill="var(--green-solid)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="expense" fill="var(--ac)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Line type="monotone" dataKey="result" stroke="var(--fg)" strokeWidth={2} dot={{ r: 3, fill: "var(--fg)" }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rosca com o total no meio. */
export function DonutChart({ data, label, height = 220 }: { data: { name: string; value: number; color: string }[]; label: string; height?: number }) {
  const total = data.reduce((t, d) => t + d.value, 0);
  return (
    <div style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as (typeof data)[number]) : null;
              if (!p) return null;
              return (
                <Tip title={p.name}>
                  <Row color={p.color} label={total ? `${Math.round((p.value / total) * 100)}%` : ""} value={brl(p.value)} />
                </Tip>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <span>
          <span className="block text-[12px] font-medium text-fg-3">{label}</span>
          <b className="block text-[18px] font-bold tracking-[-0.02em] tabular-nums">{brl(total, { compact: true })}</b>
        </span>
      </div>
    </div>
  );
}

/** Barras empilhadas por grupo de categoria, mês a mês. */
export function StackedChart({ data, keys, height = 280 }: { data: Record<string, number | string>[]; keys: { key: string; color: string }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={money} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = [...payload].filter((p) => Number(p.value) > 0).reverse();
              const total = items.reduce((t, p) => t + Number(p.value), 0);
              return (
                <Tip title={label}>
                  {items.map((p) => (
                    <Row key={String(p.dataKey)} color={String(p.color)} label={String(p.dataKey)} value={brl(Number(p.value))} />
                  ))}
                  <Row label="Total" value={brl(total)} strong />
                </Tip>
              );
            }}
          />
          {keys.map((k, i) => (
            <Bar key={k.key} dataKey={k.key} stackId="g" fill={k.color} maxBarSize={34} isAnimationActive={false} radius={i === keys.length - 1 ? [4, 4, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ritmo de gastos: acumulado no mês × mês anterior (e a linha do orçamento). */
export function PaceChart({ current, previous, budget, height = 220 }: { current: number[]; previous: number[]; budget?: number; height?: number }) {
  const n = Math.max(current.length, previous.length);
  const data = Array.from({ length: n }, (_, i) => ({ day: i + 1, current: current[i] ?? null, previous: previous[i] ?? null }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={money} />
          {budget ? <ReferenceLine y={budget} stroke="var(--red-solid)" strokeDasharray="5 4" label={{ value: "orçamento", fill: "var(--red-solid)", fontSize: 11, position: "insideTopRight" }} /> : null}
          <Tooltip
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload ? (payload[0].payload as (typeof data)[number]) : null;
              if (!p) return null;
              return (
                <Tip title={`Até o dia ${p.day}`}>
                  {p.current !== null && <Row color="var(--ac)" label="Este mês" value={brl(p.current)} />}
                  {p.previous !== null && <Row color="var(--fg-3)" label="Mês anterior" value={brl(p.previous)} />}
                </Tip>
              );
            }}
          />
          <Line type="monotone" dataKey="previous" stroke="var(--fg-3)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          <Area type="monotone" dataKey="current" stroke="var(--ac)" strokeWidth={2.5} fill="var(--ac)" fillOpacity={0.12} dot={false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Projeção: entradas e saídas previstas e o saldo ao fim de cada mês. */
export function ProjectionChart({ data, height = 280 }: { data: { label: string; income: number; expense: number; balance: number }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={money} />
          <ReferenceLine y={0} stroke="var(--red-solid)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload ? (payload[0].payload as (typeof data)[number]) : null;
              if (!p) return null;
              return (
                <Tip title={p.label}>
                  <Row color="var(--green-solid)" label="Entradas" value={brl(p.income)} />
                  <Row color="var(--ac)" label="Saídas" value={brl(p.expense)} />
                  <Row label="Saldo previsto" value={brl(p.balance)} strong />
                </Tip>
              );
            }}
          />
          <Bar dataKey="income" fill="var(--green-solid)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="expense" fill="var(--ac)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Line type="monotone" dataKey="balance" stroke="var(--fg)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--fg)" }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras simples (dia da semana, etc.). */
export function SimpleBars({ data, height = 200, color = "var(--ac)", valueLabel }: { data: { label: string; value: number }[]; height?: number; color?: string; valueLabel: string }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={money} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload ? (payload[0].payload as (typeof data)[number]) : null;
              if (!p) return null;
              return (
                <Tip title={p.label}>
                  <Row label={valueLabel} value={brl(p.value)} />
                </Tip>
              );
            }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Linha de evolução de um valor (categoria escolhida, patrimônio…). */
export function TrendLine({ data, height = 200, color = "var(--ac)" }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={money} />
          <Tooltip
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload ? (payload[0].payload as (typeof data)[number]) : null;
              if (!p) return null;
              return (
                <Tip title={p.label}>
                  <Row label="Total" value={brl(p.value)} />
                </Tip>
              );
            }}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
