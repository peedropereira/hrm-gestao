"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, CreditCard, Info, TrendingUp } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Card, PanelHead } from "@/components/ds";
import { CatIcon, MonthSwitcher, NewTxButton, QuickAdd, TxRow, useFin } from "@/components/fin/fin-ui";
import { CashflowChart, DonutChart, PaceChart } from "@/components/fin/charts-lazy";
import { Delta, Legend } from "./relatorios/relatorios-view";
import { dailyCumulative, insights, pct, type Insight } from "@/lib/fin-report";
import { formatShort } from "@/lib/dates";
import { addMonth, brl, lastDay, monthAbbr, type FinAccountDTO, type FinInvoiceDTO, type FinTxDTO, type ReportTx } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

type Props = {
  month: string;
  txs: FinTxDTO[];
  open: FinTxDTO[];
  history: { month: string; income: number; expense: number }[];
  accounts: FinAccountDTO[];
  invoices: FinInvoiceDTO[];
  recent: ReportTx[];
};

function Tile({ label, value, sub, tone, children }: { label: string; value: string; sub?: string; tone?: "green" | "red"; children?: React.ReactNode }) {
  return (
    <Card className="grid min-w-0 gap-0.5 px-3.5 py-3 sm:px-4 sm:py-3.5">
      <span className="text-[14px] font-medium text-fg-3 md:text-[13px]">{label}</span>
      <b className={cn("truncate text-[19px] font-bold leading-tight tracking-[-0.02em] tabular-nums sm:text-[24px] md:text-[22px]", tone === "green" && "text-green", tone === "red" && "text-red")}>{value}</b>
      {sub && <span className="text-[13px] text-fg-3">{sub}</span>}
      {children && <span className="flex flex-wrap items-center gap-x-1 text-[13px] text-fg-3">{children}</span>}
    </Card>
  );
}

const INSIGHT_ICON = { red: AlertTriangle, amber: AlertTriangle, green: CheckCircle2, neutral: Info };
const INSIGHT_CLS = { red: "bg-red-bg text-red", amber: "bg-amber-bg text-fg", green: "bg-green-bg text-green", neutral: "bg-surface-2 text-fg-2" };

export function PainelView({ month, txs, open, history, accounts, invoices, recent }: Props) {
  const { today } = useApp();
  const { categories, accById } = useFin();
  const [expanded, setExpanded] = useState<string | null>(null);

  const income = txs.filter((t) => t.kind === "INCOME");
  const expense = txs.filter((t) => t.kind === "EXPENSE");
  const sum = (l: FinTxDTO[]) => l.reduce((t, x) => t + x.amount, 0);
  const isCard = (t: FinTxDTO) => t.cardPending || accById(t.accountId)?.type === "CREDIT_CARD";
  const totalIn = sum(income);
  const totalOut = sum(expense);
  const received = sum(income.filter((t) => t.paid));
  const paidOut = sum(expense.filter((t) => t.paid || isCard(t)));
  const result = totalIn - totalOut;

  const liquid = accounts.filter((a) => !a.archived && a.type !== "CREDIT_CARD");
  const cards = accounts.filter((a) => !a.archived && a.type === "CREDIT_CARD");
  const cash = liquid.reduce((t, a) => t + a.balance, 0);
  const cardOpen = cards.reduce((t, a) => t + Math.min(0, a.balance), 0);

  // contas a pagar: despesas em aberto + faturas do mês não pagas
  const payables = open.filter((t) => t.kind === "EXPENSE");
  const receivables = open.filter((t) => t.kind === "INCOME");
  const monthInvoices = invoices.filter((i) => !i.paid && i.total > 0 && i.month <= month);
  const toPay = sum(payables) + monthInvoices.reduce((t, i) => t + i.total, 0);

  // gastos por grupo de categoria
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string, { total: number; budget: number; color: string; icon: string; cats: Map<string, number> }>();
  for (const t of expense) {
    const c = t.categoryId ? catMap.get(t.categoryId) : undefined;
    const g = c?.group ?? "Sem categoria";
    const cur = groups.get(g) ?? { total: 0, budget: 0, color: c?.color ?? "#64748b", icon: c?.icon ?? "tag", cats: new Map() };
    cur.total += t.amount;
    cur.cats.set(c?.name ?? "Sem categoria", (cur.cats.get(c?.name ?? "Sem categoria") ?? 0) + t.amount);
    groups.set(g, cur);
  }
  for (const c of categories.filter((x) => x.kind === "EXPENSE" && x.budget && !x.archived)) {
    const cur = groups.get(c.group) ?? { total: 0, budget: 0, color: c.color, icon: c.icon, cats: new Map() };
    cur.budget += c.budget!;
    groups.set(c.group, cur);
  }
  const groupList = [...groups.entries()].filter(([, g]) => g.total > 0 || g.budget > 0).sort((a, b) => b[1].total - a[1].total);
  const maxG = Math.max(1, ...groupList.map(([, g]) => Math.max(g.total, g.budget)));
  const recurringOut = sum(expense.filter((t) => t.recurringId));

  // comparação com o mês anterior e ritmo de gastos
  const prevMonth = addMonth(month, -1);
  const prevRows = recent.filter((r) => r.month === prevMonth);
  const prevIn = prevRows.filter((r) => r.kind === "INCOME").reduce((t, r) => t + r.amount, 0);
  const prevOut = prevRows.filter((r) => r.kind === "EXPENSE").reduce((t, r) => t + r.amount, 0);
  const isCurrent = month === today.slice(0, 7);
  const days = lastDay(month);
  const dayNow = isCurrent ? Number(today.slice(8, 10)) : days;
  const pace = useMemo(() => dailyCumulative(recent, month, dayNow), [recent, month, dayNow]);
  const pacePrev = useMemo(() => dailyCumulative(recent, prevMonth, lastDay(prevMonth)), [recent, prevMonth]);
  const spentNow = pace.at(-1) ?? 0;
  const spentPrevSame = pacePrev[Math.min(dayNow, pacePrev.length) - 1] ?? 0;
  const totalBudget = categories.filter((c) => c.kind === "EXPENSE" && c.budget && !c.archived).reduce((t, c) => t + c.budget!, 0);
  const tips: Insight[] = useMemo(
    () => insights({ rows: recent, month, prevMonths: [addMonth(month, -3), addMonth(month, -2), prevMonth], categories, dayOfMonth: dayNow, daysInMonth: days }),
    [recent, month, prevMonth, categories, dayNow, days],
  );

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} />
        <NewTxButton />
      </div>
      <Card className="min-w-0 p-3">
        <QuickAdd />
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4 [&>*]:min-w-0">
        <Tile label="Receitas do mês" value={brl(totalIn)} sub={`recebido ${brl(received)}`} tone="green">
          <Delta now={totalIn} before={prevIn} vs={`vs ${monthAbbr(prevMonth)}`} />
        </Tile>
        <Tile label="Despesas do mês" value={brl(totalOut)} sub={`pago ${brl(paidOut)} · fixos ${brl(recurringOut)}`}>
          <Delta now={totalOut} before={prevOut} invert vs={`vs ${monthAbbr(prevMonth)}`} />
        </Tile>
        <Tile label="Resultado" value={brl(result, { sign: true })} sub={totalIn ? `${Math.round((result / totalIn) * 100)}% da receita` : "receitas − despesas"} tone={result >= 0 ? "green" : "red"} />
        <Tile label="Saldo em contas" value={brl(cash)} sub={cards.length ? `cartões em aberto ${brl(cardOpen)}` : `${liquid.length} contas`} tone={cash < 0 ? "red" : undefined} />
      </div>

      {tips.length > 0 && (
        <Card>
          <PanelHead title="Alertas e dicas" count={tips.length}>
            <Link href="/financas/relatorios" className="text-[13px] font-semibold text-ac-text">
              Relatórios
            </Link>
          </PanelHead>
          <ul className="grid gap-2 p-3 md:grid-cols-2">
            {tips.map((t) => {
              const I = INSIGHT_ICON[t.tone];
              return (
                <li key={t.title} className={cn("flex gap-2.5 rounded-[10px] px-3 py-2.5", INSIGHT_CLS[t.tone])}>
                  <I className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <b className="block text-[14px]">{t.title}</b>
                    <span className="text-[13px] opacity-90">{t.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <PanelHead
            title={
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp className="size-4" /> Ritmo de gastos
              </span>
            }
          />
          <p className="px-4 pt-3 text-[14px] text-fg-2">
            {isCurrent ? `Até hoje (dia ${dayNow})` : "No mês"} você gastou <b className="tabular-nums">{brl(spentNow)}</b>
            {spentPrevSame > 0 && (
              <>
                {" · "}
                {spentNow > spentPrevSame ? (
                  <span className="font-semibold text-red">{pct((spentNow - spentPrevSame) / spentPrevSame)} a mais</span>
                ) : (
                  <span className="font-semibold text-green">{pct((spentPrevSame - spentNow) / spentPrevSame)} a menos</span>
                )}{" "}
                que em {monthAbbr(prevMonth)} até o mesmo dia
              </>
            )}
            .
          </p>
          <div className="px-2 pb-1 pt-2">
            <PaceChart current={pace} previous={pacePrev} budget={totalBudget || undefined} />
          </div>
          <Legend items={[["var(--ac)", "Este mês (acumulado)"], ["var(--fg-3)", monthAbbr(prevMonth)], ...(totalBudget ? ([["var(--red-solid)", `Orçamento ${brl(totalBudget)}`]] as [string, string][]) : [])]} />
        </Card>
        <Card>
          <PanelHead title="Despesas do mês por grupo" />
          {groupList.length === 0 ? (
            <p className="px-4 py-5 text-[15px] text-fg-3">Sem despesas neste mês.</p>
          ) : (
            <div className="grid items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <DonutChart data={groupList.filter(([, g]) => g.total > 0).map(([name, g]) => ({ name, value: Math.round(g.total * 100) / 100, color: g.color }))} label="Despesas" height={210} />
              <ul className="grid gap-1.5 px-1">
                {groupList
                  .filter(([, g]) => g.total > 0)
                  .slice(0, 7)
                  .map(([name, g]) => (
                    <li key={name} className="flex items-center justify-between gap-2 text-[14px] md:text-[13px]">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                        <span className="truncate">{name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-fg-2">{totalOut ? pct(g.total / totalOut) : ""}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <PanelHead title="A pagar" count={payables.length + monthInvoices.length}>
            <span className="text-[14px] font-semibold tabular-nums md:text-[13px]">{brl(toPay)}</span>
          </PanelHead>
          {payables.length + monthInvoices.length === 0 ? (
            <p className="px-4 py-5 text-[15px] text-fg-3">Nada em aberto neste mês.</p>
          ) : (
            <ul>
              {monthInvoices.map((i) => {
                const a = accById(i.accountId);
                const late = i.dueDate < today;
                return (
                  <li key={`${i.accountId}:${i.month}`} className="flex items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-2">
                      <CreditCard className="size-[18px]" />
                    </span>
                    <Link href="/financas/contas" className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium md:text-[14px]">Fatura {a?.name}</span>
                      <span className={cn("text-[13px]", late ? "font-semibold text-red" : "text-fg-3")}>
                        {late ? "venceu" : "vence"} {formatShort(i.dueDate)} · {i.count} {i.count === 1 ? "compra" : "compras"}
                      </span>
                    </Link>
                    <span className="font-semibold tabular-nums">{brl(i.total)}</span>
                  </li>
                );
              })}
              {payables.map((t) => (
                <TxRow key={t.id + t.paid} t={t} />
              ))}
            </ul>
          )}
          {receivables.length > 0 && (
            <>
              <div className="border-t border-line bg-surface-2 px-4 py-2 text-[13px] font-bold uppercase tracking-[0.05em] text-fg-3">A receber · {brl(sum(receivables))}</div>
              <ul>
                {receivables.map((t) => (
                  <TxRow key={t.id + t.paid} t={t} />
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <PanelHead title="Gastos e orçamentos">
            <Link href={`/financas/categorias?mes=${month}`} className="text-[13px] font-semibold text-ac-text">
              Definir orçamentos
            </Link>
          </PanelHead>
          {groupList.length === 0 ? (
            <p className="px-4 py-5 text-[15px] text-fg-3">Sem despesas neste mês.</p>
          ) : (
            <ul>
              {groupList.map(([name, g]) => {
                const over = g.budget > 0 && g.total > g.budget;
                const open = expanded === name;
                return (
                  <li key={name} className="border-t border-line first:border-t-0">
                    <button type="button" className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3.5 py-2.5 text-left hover:bg-surface-2" onClick={() => setExpanded(open ? null : name)} aria-expanded={open}>
                      <CatIcon cat={{ icon: g.icon, color: g.color }} size={30} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-[15px] font-medium md:text-[14px]">
                          {name}
                          <ChevronDown className={cn("size-4 text-fg-3 transition-transform", open && "rotate-180")} />
                        </span>
                        <span className="relative mt-1 block h-2 overflow-hidden rounded-full bg-surface-2">
                          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(g.total / maxG) * 100}%`, background: over ? "var(--red-solid)" : g.color }} />
                          {g.budget > 0 && <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${Math.min(100, (g.budget / maxG) * 100)}%` }} title="orçamento" />}
                        </span>
                      </span>
                      <span className="text-right">
                        <b className={cn("block text-[15px] tabular-nums md:text-[14px]", over && "text-red")}>{brl(g.total)}</b>
                        {g.budget > 0 && <span className="text-[12px] text-fg-3">de {brl(g.budget)}</span>}
                      </span>
                    </button>
                    {open && (
                      <ul className="bg-surface-2/60 pb-2 pl-[58px] pr-3.5">
                        {[...g.cats.entries()]
                          .sort((a, b) => b[1] - a[1])
                          .map(([c, v]) => (
                            <li key={c} className="flex justify-between py-1 text-[14px] text-fg-2">
                              <span>{c}</span>
                              <span className="tabular-nums">{brl(v)}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <PanelHead title="Receitas e despesas · 12 meses">
          <Link href="/financas/relatorios?p=12" className="text-[13px] font-semibold text-ac-text">
            Ver relatório
          </Link>
        </PanelHead>
        <div className="px-2 pb-1 pt-3">
          <CashflowChart data={history.map((h) => ({ ...h, label: monthAbbr(h.month), result: h.income - h.expense }))} height={240} />
        </div>
        <Legend items={[["var(--green-solid)", "Receitas"], ["var(--ac)", "Despesas"], ["var(--fg)", "Resultado"]]} />
      </Card>

      <Card>
        <PanelHead title="Últimos lançamentos" count={txs.length}>
          <Link href={`/financas/lancamentos?mes=${month}`} className="text-[13px] font-semibold text-ac-text">
            Ver todos
          </Link>
        </PanelHead>
        {txs.length === 0 ? (
          <p className="px-4 py-5 text-[15px] text-fg-3">Nenhum lançamento neste mês. Use o campo acima: “mercado 230”.</p>
        ) : (
          <ul>
            {txs.slice(0, 8).map((t) => (
              <TxRow key={t.id + t.paid} t={t} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
