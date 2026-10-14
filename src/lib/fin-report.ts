// Cálculos dos relatórios de finanças (no aparelho, a partir dos lançamentos enxutos).

import { descKey } from "./fin-parse";
import { cleanMerchant } from "./fin-merchants";
import { brl, monthAbbr, type FinCategoryDTO, type ReportTx } from "./fin-types";

export const OTHER_COLOR = "#94a3b8";
const UNCAT = "Sem categoria";

export type MonthTotals = { month: string; label: string; income: number; expense: number; result: number; fixed: number; card: number };

/** Receitas, despesas e resultado por mês (meses sem lançamento aparecem zerados). */
export function totalsByMonth(rows: ReportTx[], months: string[]): MonthTotals[] {
  const map = new Map(months.map((m) => [m, { month: m, label: monthAbbr(m), income: 0, expense: 0, result: 0, fixed: 0, card: 0 }]));
  for (const r of rows) {
    const s = map.get(r.month);
    if (!s) continue;
    if (r.kind === "INCOME") s.income += r.amount;
    else {
      s.expense += r.amount;
      if (r.recurring) s.fixed += r.amount;
      if (r.card) s.card += r.amount;
    }
  }
  return [...map.values()].map((s) => ({ ...s, income: round(s.income), expense: round(s.expense), result: round(s.income - s.expense), fixed: round(s.fixed), card: round(s.card) }));
}

export type Slice = { key: string; name: string; value: number; color: string; icon: string; share: number; children: { name: string; value: number }[] };

/** Despesas (ou receitas) por grupo de categoria, com as categorias dentro. */
export function byGroup(rows: ReportTx[], categories: FinCategoryDTO[], kind: "EXPENSE" | "INCOME" = "EXPENSE"): Slice[] {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const map = new Map<string, Slice & { cats: Map<string, number> }>();
  let total = 0;
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const c = r.categoryId ? cat.get(r.categoryId) : undefined;
    const g = c?.group ?? UNCAT;
    const cur = map.get(g) ?? { key: g, name: g, value: 0, color: c?.color ?? OTHER_COLOR, icon: c?.icon ?? "tag", share: 0, children: [], cats: new Map() };
    cur.value += r.amount;
    cur.cats.set(c?.name ?? UNCAT, (cur.cats.get(c?.name ?? UNCAT) ?? 0) + r.amount);
    map.set(g, cur);
    total += r.amount;
  }
  return [...map.values()]
    .map(({ cats, ...s }) => ({
      ...s,
      value: round(s.value),
      share: total ? s.value / total : 0,
      children: [...cats.entries()].map(([name, value]) => ({ name, value: round(value) })).sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Despesas por categoria (nível de categoria, não de grupo). */
export function byCategory(rows: ReportTx[], categories: FinCategoryDTO[]) {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const map = new Map<string, { id: string; name: string; group: string; color: string; icon: string; value: number; budget: number | null }>();
  for (const r of rows) {
    if (r.kind !== "EXPENSE") continue;
    const c = r.categoryId ? cat.get(r.categoryId) : undefined;
    const k = c?.id ?? "-";
    const cur = map.get(k) ?? { id: k, name: c?.name ?? UNCAT, group: c?.group ?? UNCAT, color: c?.color ?? OTHER_COLOR, icon: c?.icon ?? "tag", value: 0, budget: c?.budget ?? null };
    cur.value += r.amount;
    map.set(k, cur);
  }
  return [...map.values()].map((x) => ({ ...x, value: round(x.value) })).sort((a, b) => b.value - a.value);
}

/** Matriz grupo × mês (tabela mensal e gráfico empilhado). */
export function groupMatrix(rows: ReportTx[], categories: FinCategoryDTO[], months: string[], kind: "EXPENSE" | "INCOME" = "EXPENSE") {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const idx = new Map(months.map((m, i) => [m, i]));
  const map = new Map<string, { name: string; color: string; values: number[] }>();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const i = idx.get(r.month);
    if (i === undefined) continue;
    const c = r.categoryId ? cat.get(r.categoryId) : undefined;
    const g = c?.group ?? UNCAT;
    const cur = map.get(g) ?? { name: g, color: c?.color ?? OTHER_COLOR, values: months.map(() => 0) };
    cur.values[i] += r.amount;
    map.set(g, cur);
  }
  return [...map.values()]
    .map((g) => {
      const values = g.values.map(round);
      const total = round(values.reduce((t, v) => t + v, 0));
      return { ...g, values, total, avg: round(total / Math.max(1, months.length)) };
    })
    .sort((a, b) => b.total - a.total);
}

/** Dados do gráfico empilhado: os maiores grupos e o resto em "Outros". */
export function stackedData(matrix: ReturnType<typeof groupMatrix>, months: string[], top = 6) {
  const main = matrix.slice(0, top);
  const rest = matrix.slice(top);
  const keys = [...main.map((g) => ({ key: g.name, color: g.color }))];
  if (rest.length) keys.push({ key: "Outros", color: OTHER_COLOR });
  const data = months.map((m, i) => {
    const row: Record<string, number | string> = { label: monthAbbr(m) };
    for (const g of main) row[g.name] = g.values[i];
    if (rest.length) row.Outros = round(rest.reduce((t, g) => t + g.values[i], 0));
    return row;
  });
  return { keys, data };
}

/** Onde mais gastou: estabelecimento (nome limpo), vezes, total e ticket médio. */
export function topMerchants(rows: ReportTx[], n = 10) {
  const map = new Map<string, { name: string; count: number; total: number; categoryId: string | null }>();
  for (const r of rows) {
    if (r.kind !== "EXPENSE" || r.recurring) continue;
    const k = descKey(r.description) || cleanMerchant(r.description);
    if (!k) continue;
    const cur = map.get(k) ?? { name: prettyName(r.description), count: 0, total: 0, categoryId: r.categoryId };
    cur.count++;
    cur.total += r.amount;
    map.set(k, cur);
  }
  return [...map.values()]
    .map((m) => ({ ...m, total: round(m.total), avg: round(m.total / m.count) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function prettyName(s: string) {
  const t = s
    .replace(/\s*\(?\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)?\s*$/, "")
    .replace(/^[•·\s\d]+(?=[a-z])/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t === t.toUpperCase()) return t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return t;
}

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Gasto médio por dia da semana (pela data da compra; sem fixos). */
export function byWeekday(rows: ReportTx[]) {
  const total = WEEK.map(() => 0);
  const days = WEEK.map(() => new Set<string>());
  for (const r of rows) {
    if (r.kind !== "EXPENSE" || r.recurring || r.installment) continue;
    const d = new Date(`${r.date}T12:00:00Z`).getUTCDay();
    total[d] += r.amount;
    days[d].add(r.date);
  }
  return WEEK.map((label, i) => ({ label, total: round(total[i]), avg: days[i].size ? round(total[i] / days[i].size) : 0 }));
}

/** Gasto acumulado dia a dia no mês (para comparar o ritmo com o mês anterior). */
export function dailyCumulative(rows: ReportTx[], month: string, untilDay = 31) {
  const by = new Array(32).fill(0) as number[];
  for (const r of rows) {
    if (r.kind !== "EXPENSE" || r.month !== month) continue;
    // no cartão vale a data da compra, limitada ao mês da fatura
    const d = r.date.slice(0, 7) === month ? Number(r.date.slice(8, 10)) : r.date < `${month}-01` ? 1 : 31;
    by[d] += r.amount;
  }
  const out: number[] = [];
  let acc = 0;
  for (let d = 1; d <= untilDay; d++) {
    acc += by[d];
    out.push(round(acc));
  }
  return out;
}

export type Insight = { tone: "red" | "amber" | "green" | "neutral"; title: string; text: string };

/** Alertas automáticos do mês: orçamento estourado, categoria acima da média, poupança. */
export function insights(p: { rows: ReportTx[]; month: string; prevMonths: string[]; categories: FinCategoryDTO[]; dayOfMonth: number; daysInMonth: number }): Insight[] {
  const out: Insight[] = [];
  const cur = p.rows.filter((r) => r.month === p.month);
  const prev = p.rows.filter((r) => p.prevMonths.includes(r.month));
  const nPrev = Math.max(1, new Set(prev.map((r) => r.month)).size);
  const curCats = byCategory(cur, p.categories);
  const prevCats = new Map(byCategory(prev, p.categories).map((c) => [c.id, c.value / nPrev]));

  const flagged = new Set<string>();
  for (const c of curCats) {
    if (c.budget && c.value > c.budget * 0.8) flagged.add(c.id);
    if (c.budget && c.value > c.budget) out.push({ tone: "red", title: `${c.name}: orçamento estourado`, text: `${brl(c.value)} de ${brl(c.budget)} (${Math.round((c.value / c.budget) * 100)}%).` });
    else if (c.budget && c.value > c.budget * 0.8) out.push({ tone: "amber", title: `${c.name}: perto do limite`, text: `Já usou ${Math.round((c.value / c.budget) * 100)}% do orçamento de ${brl(c.budget)}.` });
  }
  if (prev.length) {
    for (const c of curCats.slice(0, 12)) {
      const avg = prevCats.get(c.id) ?? 0;
      if (c.id === "-" || flagged.has(c.id) || avg < 150 || c.value < 200) continue;
      const pct = (c.value - avg) / avg;
      if (pct >= 0.3) out.push({ tone: "amber", title: `${c.name} ${Math.round(pct * 100)}% acima da média`, text: `${brl(c.value)} neste mês; a média dos meses anteriores é ${brl(avg)}.` });
    }
    for (const [id, avg] of prevCats) {
      const now = curCats.find((c) => c.id === id)?.value ?? 0;
      const name = p.categories.find((c) => c.id === id)?.name;
      if (name && avg >= 300 && now < avg * 0.6 && p.dayOfMonth >= p.daysInMonth - 3) out.push({ tone: "green", title: `${name}: gastou menos`, text: `${brl(now)} contra a média de ${brl(avg)}.` });
    }
  }
  const inc = cur.filter((r) => r.kind === "INCOME").reduce((t, r) => t + r.amount, 0);
  const exp = cur.filter((r) => r.kind === "EXPENSE").reduce((t, r) => t + r.amount, 0);
  if (inc > 0) {
    const rate = (inc - exp) / inc;
    if (rate >= 0.2) out.push({ tone: "green", title: `Poupando ${Math.round(rate * 100)}% da renda`, text: `Sobra prevista de ${brl(inc - exp)} no mês. A referência saudável é 20% ou mais.` });
    else if (rate < 0) out.push({ tone: "red", title: "Despesas maiores que as receitas", text: `Faltam ${brl(exp - inc)} para fechar o mês no zero.` });
  }
  const uncat = cur.filter((r) => r.kind === "EXPENSE" && !r.categoryId).length;
  if (uncat) out.push({ tone: "neutral", title: `${uncat} ${uncat === 1 ? "lançamento" : "lançamentos"} sem categoria`, text: "Categorize para os relatórios ficarem completos." });
  const rank = { red: 0, amber: 1, green: 2, neutral: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 6);
}

/** Planilha (CSV com ; e BOM: abre direto no Excel em português). */
export function toCSV(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    if (typeof v === "number") return v.toFixed(2).replace(".", ",");
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const round = (v: number) => Math.round(v * 100) / 100;
/** Variação percentual (null quando não há base). */
export const delta = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
