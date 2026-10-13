"use client";

// Gráfico de receitas x despesas (recharts), carregado depois do resto do painel.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl, monthAbbr } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

export function HistoryChart({ history }: { history: { month: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={history.map((h) => ({ ...h, label: monthAbbr(h.month) }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--fg-3)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={6} />
        <YAxis tick={{ fill: "var(--fg-3)", fontSize: 12 }} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => brl(v, { compact: true }).replace(",00", "")} />
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          content={({ active, payload }) => {
            const p = active && payload?.[0]?.payload ? (payload[0].payload as { label: string; income: number; expense: number }) : null;
            if (!p) return null;
            return (
              <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow-sm)]">
                <b className="block">{p.label}</b>
                <span className="block text-green">Receitas {brl(p.income)}</span>
                <span className="block">Despesas {brl(p.expense)}</span>
                <span className={cn("block font-semibold", p.income - p.expense >= 0 ? "text-green" : "text-red")}>Resultado {brl(p.income - p.expense, { sign: true })}</span>
              </div>
            );
          }}
        />
        <Bar dataKey="income" name="Receitas" fill="var(--green-solid)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="expense" name="Despesas" fill="var(--ac)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
