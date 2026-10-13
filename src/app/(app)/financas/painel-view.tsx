"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, CreditCard } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/app-provider";
import { Card, PanelHead } from "@/components/ds";
import { CatIcon, MonthSwitcher, NewTxButton, QuickAdd, TxRow, useFin } from "@/components/fin/fin-ui";
import { formatShort } from "@/lib/dates";
import { brl, monthAbbr, type FinAccountDTO, type FinInvoiceDTO, type FinTxDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

type Props = {
  month: string;
  txs: FinTxDTO[];
  open: FinTxDTO[];
  history: { month: string; income: number; expense: number }[];
  accounts: FinAccountDTO[];
  invoices: FinInvoiceDTO[];
};

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <Card className="grid min-w-0 gap-0.5 px-3.5 py-3 sm:px-4 sm:py-3.5">
      <span className="text-[14px] font-medium text-fg-3 md:text-[13px]">{label}</span>
      <b className={cn("truncate text-[19px] font-bold leading-tight tracking-[-0.02em] tabular-nums sm:text-[24px] md:text-[22px]", tone === "green" && "text-green", tone === "red" && "text-red")}>{value}</b>
      {sub && <span className="text-[13px] text-fg-3">{sub}</span>}
    </Card>
  );
}

export function PainelView({ month, txs, open, history, accounts, invoices }: Props) {
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
        <Tile label="Receitas do mês" value={brl(totalIn)} sub={`recebido ${brl(received)}`} tone="green" />
        <Tile label="Despesas do mês" value={brl(totalOut)} sub={`pago ${brl(paidOut)} · fixos ${brl(recurringOut)}`} />
        <Tile label="Resultado" value={brl(result, { sign: true })} sub={totalIn ? `${Math.round((result / totalIn) * 100)}% da receita` : "receitas − despesas"} tone={result >= 0 ? "green" : "red"} />
        <Tile label="Saldo em contas" value={brl(cash)} sub={cards.length ? `cartões em aberto ${brl(cardOpen)}` : `${liquid.length} contas`} tone={cash < 0 ? "red" : undefined} />
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
          <PanelHead title="Gastos por categoria">
            <Link href={`/financas/categorias?mes=${month}`} className="text-[13px] font-semibold text-ac-text">
              Orçamentos
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
        <PanelHead title="Receitas e despesas · 12 meses" />
        <div className="h-[240px] px-2 pb-2 pt-3">
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
        </div>
        <p className="flex gap-4 px-4 pb-3 text-[13px] text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-green-solid" /> Receitas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-ac" /> Despesas
          </span>
        </p>
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
