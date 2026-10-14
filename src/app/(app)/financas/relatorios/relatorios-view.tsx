"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Download, FileSpreadsheet } from "lucide-react";
import { Card, PanelHead } from "@/components/ds";
import { Button } from "@/components/button";
import { CatIcon, useFin } from "@/components/fin/fin-ui";
import { CashflowChart, DonutChart, SimpleBars, StackedChart, TrendLine } from "@/components/fin/charts-lazy";
import { byGroup, byWeekday, delta, downloadText, groupMatrix, pct, stackedData, toCSV, topMerchants, totalsByMonth } from "@/lib/fin-report";
import { brl, monthAbbr, monthName, monthsBetween, type ReportTx } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

export type Period = "3" | "6" | "12" | "ano" | "ano-1";
const PERIOD_LABEL: [Period, string][] = [
  ["3", "3 meses"],
  ["6", "6 meses"],
  ["12", "12 meses"],
  ["ano", "Este ano"],
  ["ano-1", "Ano passado"],
];

export function Delta({ now, before, invert, className, vs }: { now: number; before: number; invert?: boolean; className?: string; vs?: string }) {
  const d = delta(now, before);
  if (d === null) return <span className={cn("text-[13px] text-fg-3", className)}>{vs ? "sem dados para comparar" : "novo"}</span>;
  if (Math.abs(d) < 0.005) return <span className={cn("text-[13px] text-fg-3", className)}>igual{vs ? ` ${vs}` : ""}</span>;
  const up = d > 0;
  const good = invert ? !up : up;
  const I = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[13px] font-semibold", good ? "text-green" : "text-red", className)}>
      <I className="size-3.5" />
      {pct(Math.abs(d))}
      {vs && <span className="font-normal text-fg-3">&nbsp;{vs}</span>}
    </span>
  );
}

function Kpi({ label, value, children, tone }: { label: string; value: string; children?: React.ReactNode; tone?: "green" | "red" }) {
  return (
    <Card className="grid min-w-0 gap-0.5 px-3.5 py-3 sm:px-4 sm:py-3.5">
      <span className="text-[14px] font-medium text-fg-3 md:text-[13px]">{label}</span>
      <b className={cn("truncate text-[19px] font-bold leading-tight tracking-[-0.02em] tabular-nums sm:text-[22px]", tone === "green" && "text-green", tone === "red" && "text-red")}>{value}</b>
      <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-3">{children}</span>
    </Card>
  );
}

export function RelatoriosView({ period, from, to, prevFrom, rows, current }: { period: Period; from: string; to: string; prevFrom: string; rows: ReportTx[]; current: string }) {
  const { categories } = useFin();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [trendCat, setTrendCat] = useState<string>("");
  const [tableKind, setTableKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");

  const months = useMemo(() => monthsBetween(from, to), [from, to]);
  const cur = useMemo(() => rows.filter((r) => r.month >= from && r.month <= to), [rows, from, to]);
  const prev = useMemo(() => rows.filter((r) => r.month >= prevFrom && r.month < from), [rows, prevFrom, from]);

  const totals = useMemo(() => totalsByMonth(cur, months), [cur, months]);
  const sum = (l: ReportTx[], k: "EXPENSE" | "INCOME") => l.filter((r) => r.kind === k).reduce((t, r) => t + r.amount, 0);
  const inc = sum(cur, "INCOME");
  const exp = sum(cur, "EXPENSE");
  const pInc = sum(prev, "INCOME");
  const pExp = sum(prev, "EXPENSE");
  const saving = inc > 0 ? (inc - exp) / inc : null;
  const pSaving = pInc > 0 ? (pInc - pExp) / pInc : null;
  // média só dos meses já fechados (o mês atual ainda está acontecendo)
  const closed = totals.filter((t) => t.month < current);
  const closedMonths = closed.length || months.length;
  const avgExp = (closed.length ? closed : totals).reduce((t, m) => t + m.expense, 0) / closedMonths;

  const groups = useMemo(() => byGroup(cur, categories), [cur, categories]);
  const prevGroups = useMemo(() => new Map(byGroup(prev, categories).map((g) => [g.name, g.value])), [prev, categories]);
  const incomeGroups = useMemo(() => byGroup(cur, categories, "INCOME"), [cur, categories]);
  const matrix = useMemo(() => groupMatrix(cur, categories, months), [cur, categories, months]);
  const stacked = useMemo(() => stackedData(matrix, months), [matrix, months]);
  const tableRows = useMemo(() => (tableKind === "EXPENSE" ? matrix : groupMatrix(cur, categories, months, "INCOME")), [tableKind, matrix, cur, categories, months]);
  const merchants = useMemo(() => topMerchants(cur, 12), [cur]);
  const week = useMemo(() => byWeekday(cur), [cur]);

  const fixed = cur.filter((r) => r.kind === "EXPENSE" && r.recurring).reduce((t, r) => t + r.amount, 0);
  const inst = cur.filter((r) => r.kind === "EXPENSE" && r.installment && !r.recurring).reduce((t, r) => t + r.amount, 0);
  const variable = exp - fixed - inst;
  const card = cur.filter((r) => r.kind === "EXPENSE" && r.card).reduce((t, r) => t + r.amount, 0);

  const expCats = categories.filter((c) => c.kind === "EXPENSE" && !c.archived);
  const trendId = trendCat || (groups[0] ? (expCats.find((c) => c.group === groups[0].name)?.id ?? "") : "");
  const trend = months.map((m) => ({
    label: monthAbbr(m),
    value: Math.round(cur.filter((r) => r.month === m && r.kind === "EXPENSE" && (trendId.startsWith("g:") ? categories.find((c) => c.id === r.categoryId)?.group === trendId.slice(2) : r.categoryId === trendId)).reduce((t, r) => t + r.amount, 0) * 100) / 100,
  }));
  const trendAvg = trend.reduce((t, x) => t + x.value, 0) / Math.max(1, trend.length);

  const exportTable = () => {
    const head = [tableKind === "EXPENSE" ? "Despesas por grupo" : "Receitas por grupo", ...months.map(monthAbbr), "Total", "Média"];
    const body = tableRows.map((g) => [g.name, ...g.values, g.total, g.avg]);
    const totalRow = ["Total", ...months.map((_, i) => tableRows.reduce((t, g) => t + g.values[i], 0)), tableRows.reduce((t, g) => t + g.total, 0), tableRows.reduce((t, g) => t + g.avg, 0)];
    const flow = [
      [],
      ["Resumo", ...months.map(monthAbbr), "Total"],
      ["Receitas", ...totals.map((t) => t.income), inc],
      ["Despesas", ...totals.map((t) => t.expense), exp],
      ["Resultado", ...totals.map((t) => t.result), inc - exp],
    ];
    downloadText(`financas-${from}-a-${to}.csv`, toCSV([head, ...body, totalRow, ...flow]));
  };
  const exportTx = () => {
    const cat = new Map(categories.map((c) => [c.id, c]));
    const head = ["Data", "Mês", "Tipo", "Descrição", "Grupo", "Categoria", "Valor", "Fixo", "Parcelado", "Cartão", "Pago"];
    const body = cur.map((r) => [
      r.date.split("-").reverse().join("/"),
      monthAbbr(r.month),
      r.kind === "INCOME" ? "Receita" : "Despesa",
      r.description,
      cat.get(r.categoryId ?? "")?.group ?? "",
      cat.get(r.categoryId ?? "")?.name ?? "Sem categoria",
      r.kind === "INCOME" ? r.amount : -r.amount,
      r.recurring ? "sim" : "",
      r.installment ? "sim" : "",
      r.card ? "sim" : "",
      r.paid ? "sim" : "não",
    ]);
    downloadText(`lancamentos-${from}-a-${to}.csv`, toCSV([head, ...body]));
  };

  const empty = cur.length === 0;

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Período">
          {PERIOD_LABEL.map(([k, l]) => (
            <Link
              key={k}
              href={`/financas/relatorios?p=${k}`}
              scroll={false}
              role="tab"
              aria-selected={period === k}
              className={cn("flex h-10 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold md:h-8 md:text-[13px]", period === k ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-2")}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="h-10 md:h-8" onClick={exportTable} disabled={empty}>
            <FileSpreadsheet /> Resumo (Excel)
          </Button>
          <Button variant="secondary" size="sm" className="h-10 md:h-8" onClick={exportTx} disabled={empty}>
            <Download /> Lançamentos
          </Button>
        </div>
      </div>
      <p className="-mt-1 text-[14px] text-fg-3">
        {monthName(from)} a {monthName(to)} · comparado com os {months.length} meses anteriores{months.includes(current) ? " · o mês atual ainda está em andamento" : ""}.
      </p>

      {empty ? (
        <Card className="px-5 py-10 text-center text-[15px] text-fg-3">Sem lançamentos neste período.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4 [&>*]:min-w-0">
            <Kpi label="Receitas" value={brl(inc)} tone="green">
              <Delta now={inc} before={pInc} vs="vs período anterior" />
            </Kpi>
            <Kpi label="Despesas" value={brl(exp)}>
              <Delta now={exp} before={pExp} invert vs="vs período anterior" />
            </Kpi>
            <Kpi label="Taxa de poupança" value={saving === null ? "—" : pct(saving)} tone={saving !== null && saving < 0 ? "red" : saving !== null && saving >= 0.2 ? "green" : undefined}>
              {saving !== null ? `sobrou ${brl(inc - exp)}` : "sem receitas"}
              {pSaving !== null && saving !== null && <span>· antes {pct(pSaving)}</span>}
            </Kpi>
            <Kpi label="Gasto médio por mês" value={brl(avgExp)}>
              {closedMonths < months.length ? `${closedMonths} meses fechados` : `${months.length} meses`}
            </Kpi>
          </div>

          <Card>
            <PanelHead title="Fluxo de caixa" />
            <div className="px-2 pb-1 pt-3">
              <CashflowChart data={totals} />
            </div>
            <Legend items={[["var(--green-solid)", "Receitas"], ["var(--ac)", "Despesas"], ["var(--fg)", "Resultado"]]} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [&>*]:min-w-0">
            <Card>
              <PanelHead title="Para onde foi o dinheiro" />
              <div className="px-3 pt-3">
                <DonutChart data={groups.map((g) => ({ name: g.name, value: g.value, color: g.color }))} label="Despesas" />
              </div>
              <div className="px-4 pb-4 pt-2">
                <SplitBar
                  parts={[
                    { label: "Fixos", value: fixed, color: "var(--ac)" },
                    { label: "Parcelas", value: inst, color: "#7c3aed" },
                    { label: "Variáveis", value: variable, color: "#ea580c" },
                  ]}
                />
                <p className="mt-2 text-[13px] text-fg-3">
                  No cartão: <b className="text-fg-2">{brl(card)}</b> ({exp ? pct(card / exp) : "0%"} das despesas)
                </p>
              </div>
            </Card>
            <Card>
              <PanelHead title="Despesas por grupo" count={groups.length} />
              <ul>
                {groups.map((g) => {
                  const open = openGroup === g.name;
                  return (
                    <li key={g.name} className="border-t border-line first:border-t-0">
                      <button type="button" onClick={() => setOpenGroup(open ? null : g.name)} aria-expanded={open} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3.5 py-2.5 text-left hover:bg-surface-2">
                        <CatIcon cat={{ icon: g.icon, color: g.color }} size={30} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 text-[15px] font-medium md:text-[14px]">
                            <span className="truncate">{g.name}</span>
                            <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
                          </span>
                          <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${g.share * 100}%`, background: g.color }} />
                          </span>
                        </span>
                        <span className="text-right">
                          <b className="block text-[15px] tabular-nums md:text-[14px]">{brl(g.value)}</b>
                          <span className="flex items-center justify-end gap-1.5 text-[12px] text-fg-3">
                            {pct(g.share)}
                            <Delta now={g.value} before={prevGroups.get(g.name) ?? 0} invert className="text-[12px]" />
                          </span>
                        </span>
                      </button>
                      {open && (
                        <ul className="bg-surface-2/60 pb-2 pl-[58px] pr-3.5">
                          {g.children.map((c) => (
                            <li key={c.name} className="flex justify-between gap-3 py-1 text-[14px] text-fg-2">
                              <span className="truncate">{c.name}</span>
                              <span className="tabular-nums">
                                {brl(c.value)} <span className="text-fg-3">· {brl(c.value / months.length)}/mês</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card>
            <PanelHead title="Evolução das despesas por grupo" />
            <div className="px-2 pb-1 pt-3">
              <StackedChart data={stacked.data} keys={stacked.keys} />
            </div>
            <Legend items={stacked.keys.map((k) => [k.color, k.key])} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <PanelHead title="Tendência de uma categoria">
                <label className="sr-only" htmlFor="trend-cat">
                  Categoria
                </label>
                <select id="trend-cat" value={trendId} onChange={(e) => setTrendCat(e.target.value)} className="h-9 max-w-[55%] rounded-[10px] border border-line-strong bg-bg px-2 text-[14px] md:h-8 md:text-[13px]">
                  {[...new Set(expCats.map((c) => c.group))].map((g) => (
                    <optgroup key={g} label={g}>
                      <option value={`g:${g}`}>{g} (grupo todo)</option>
                      {expCats
                        .filter((c) => c.group === g)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </PanelHead>
              <div className="px-2 pb-1 pt-3">
                <TrendLine data={trend} />
              </div>
              <p className="px-4 pb-3 text-[13px] text-fg-3">
                Média de <b className="text-fg-2">{brl(trendAvg)}</b> por mês · maior: {brl(Math.max(0, ...trend.map((t) => t.value)))}
              </p>
            </Card>
            <Card>
              <PanelHead title="Gasto médio por dia da semana" />
              <div className="px-2 pb-1 pt-3">
                <SimpleBars data={week.map((w) => ({ label: w.label, value: w.avg }))} valueLabel="Média por dia" />
              </div>
              <p className="px-4 pb-3 text-[13px] text-fg-3">Só compras do dia a dia (sem fixos e parcelas), pela data da compra.</p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <PanelHead title="Onde você mais gastou" count={merchants.length} />
              <ol>
                {merchants.map((m, i) => (
                  <li key={m.name + i} className="grid grid-cols-[22px_1fr_auto] items-center gap-x-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                    <span className="text-[13px] font-semibold text-fg-3 tabular-nums">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium md:text-[14px]">{m.name}</span>
                      <span className="text-[13px] text-fg-3">
                        {m.count} {m.count === 1 ? "compra" : "compras"} · média {brl(m.avg)}
                      </span>
                    </span>
                    <b className="tabular-nums">{brl(m.total)}</b>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <PanelHead title="De onde veio o dinheiro" />
              {incomeGroups.length === 0 ? (
                <p className="px-4 py-5 text-[15px] text-fg-3">Sem receitas no período.</p>
              ) : (
                <>
                  <div className="px-3 pt-3">
                    <DonutChart data={incomeGroups.flatMap((g) => g.children.map((c, i) => ({ name: c.name, value: c.value, color: i === 0 ? g.color : `color-mix(in srgb, ${g.color} ${Math.max(35, 100 - i * 20)}%, white)` })))} label="Receitas" height={200} />
                  </div>
                  <ul className="pb-2">
                    {incomeGroups.flatMap((g) => g.children).map((c) => (
                      <li key={c.name} className="flex justify-between px-4 py-1.5 text-[14px]">
                        <span>{c.name}</span>
                        <span className="tabular-nums">
                          {brl(c.value)} <span className="text-fg-3">· {inc ? pct(c.value / inc) : ""}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <Card>
            <PanelHead title="Tabela mês a mês">
              <div className="flex gap-1">
                {(["EXPENSE", "INCOME"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setTableKind(k)} aria-pressed={tableKind === k} className={cn("h-8 rounded-full border px-3 text-[13px] font-semibold", tableKind === k ? "border-fg bg-fg text-bg" : "border-line text-fg-2")}>
                    {k === "EXPENSE" ? "Despesas" : "Receitas"}
                  </button>
                ))}
              </div>
            </PanelHead>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-[13px] tabular-nums">
                <thead>
                  <tr className="bg-surface-2 text-fg-3">
                    <th className="sticky left-0 z-10 bg-surface-2 px-3.5 py-2 text-left font-semibold">Grupo</th>
                    {months.map((m) => (
                      <th key={m} className="px-3 py-2 text-right font-semibold">
                        {monthAbbr(m)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                    <th className="px-3.5 py-2 text-right font-semibold">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((g) => (
                    <tr key={g.name} className="border-t border-line">
                      <td className="sticky left-0 z-10 bg-surface px-3.5 py-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: g.color }} />
                          {g.name}
                        </span>
                      </td>
                      {g.values.map((v, i) => (
                        <td key={i} className={cn("px-3 py-2 text-right", !v && "text-fg-3")}>
                          {v ? brl(v).replace("R$", "").trim() : "–"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold">{brl(g.total).replace("R$", "").trim()}</td>
                      <td className="px-3.5 py-2 text-right text-fg-2">{brl(g.avg).replace("R$", "").trim()}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line-strong font-bold">
                    <td className="sticky left-0 z-10 bg-surface px-3.5 py-2">Total</td>
                    {months.map((m, i) => (
                      <td key={m} className="px-3 py-2 text-right">
                        {brl(tableRows.reduce((t, g) => t + g.values[i], 0)).replace("R$", "").trim()}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">{brl(tableRows.reduce((t, g) => t + g.total, 0)).replace("R$", "").trim()}</td>
                    <td className="px-3.5 py-2 text-right">{brl(tableRows.reduce((t, g) => t + g.avg, 0)).replace("R$", "").trim()}</td>
                  </tr>
                  <tr className="border-t border-line text-fg-2">
                    <td className="sticky left-0 z-10 bg-surface px-3.5 py-2 font-semibold">Resultado do mês</td>
                    {totals.map((t) => (
                      <td key={t.month} className={cn("px-3 py-2 text-right font-semibold", t.result < 0 ? "text-red" : "text-green")}>
                        {brl(t.result, { sign: true }).replace("R$", "").trim()}
                      </td>
                    ))}
                    <td className={cn("px-3 py-2 text-right font-bold", inc - exp < 0 ? "text-red" : "text-green")}>{brl(inc - exp, { sign: true }).replace("R$", "").trim()}</td>
                    <td className="px-3.5 py-2 text-right">{brl((inc - exp) / months.length, { sign: true }).replace("R$", "").trim()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[13px] text-fg-3">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: c }} /> {l}
        </span>
      ))}
    </p>
  );
}

export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((t, p) => t + Math.max(0, p.value), 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color }} title={p.label} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
        {parts.map((p) => (
          <span key={p.label} className="min-w-0">
            <span className="flex items-center gap-1.5 text-fg-3">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <b className="block truncate tabular-nums">{brl(p.value)}</b>
            <span className="text-fg-3">{pct(Math.max(0, p.value) / total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
