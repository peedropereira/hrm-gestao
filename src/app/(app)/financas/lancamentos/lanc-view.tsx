"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Card, EmptyState } from "@/components/ds";
import { MonthSwitcher, NewTxButton, QuickAdd, TxRow, useFin } from "@/components/fin/fin-ui";
import { norm } from "@/lib/nl-parse";
import { formatLong } from "@/lib/dates";
import { brl, type FinTxDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

const FILTERS = [
  ["todos", "Todos"],
  ["despesas", "Despesas"],
  ["receitas", "Receitas"],
  ["abertos", "Em aberto"],
  ["fixos", "Fixos"],
  ["cartao", "Cartão"],
] as const;

export function LancView({ month, txs }: { month: string; txs: FinTxDTO[] }) {
  const { catById, accById, accounts } = useFin();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("todos");
  const [q, setQ] = useState("");
  const [acc, setAcc] = useState("");

  const isCard = (t: FinTxDTO) => t.cardPending || accById(t.accountId)?.type === "CREDIT_CARD";
  const shown = txs.filter((t) => {
    if (filter === "despesas" && t.kind !== "EXPENSE") return false;
    if (filter === "receitas" && t.kind !== "INCOME") return false;
    if (filter === "abertos" && (t.paid || isCard(t) || t.kind === "TRANSFER")) return false;
    if (filter === "fixos" && !t.recurringId) return false;
    if (filter === "cartao" && !isCard(t)) return false;
    if (acc && t.accountId !== acc && t.toAccountId !== acc) return false;
    if (q.trim()) {
      const hay = norm(`${t.description} ${catById(t.categoryId)?.name ?? ""} ${catById(t.categoryId)?.group ?? ""} ${t.notes ?? ""}`);
      if (!hay.includes(norm(q.trim()))) return false;
    }
    return true;
  });
  const income = shown.filter((t) => t.kind === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = shown.filter((t) => t.kind === "EXPENSE").reduce((s, t) => s + t.amount, 0);

  const byDay = new Map<string, FinTxDTO[]>();
  for (const t of shown) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} />
        <NewTxButton />
      </div>
      <Card className="p-3.5">
        <QuickAdd />
      </Card>

      <div className="grid gap-2.5 md:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar descrição ou categoria"
            className="h-11 w-full rounded-[12px] border border-line-strong bg-bg pl-9 pr-3 text-[16px] outline-none focus:border-ac md:h-10 md:text-[14px]"
          />
        </label>
        <label className="sr-only" htmlFor="lanc-acc">
          Conta
        </label>
        <select id="lanc-acc" value={acc} onChange={(e) => setAcc(e.target.value)} className="h-11 rounded-[12px] border border-line-strong bg-bg px-3 text-[16px] md:h-10 md:text-[14px]">
          <option value="">Todas as contas</option>
          {accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <p className="flex items-center gap-3 text-[14px] tabular-nums">
          <span className="text-green">+{brl(income)}</span>
          <span>-{brl(expense)}</span>
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtro">
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={cn("h-10 shrink-0 rounded-full border px-4 text-[15px] font-semibold md:h-8 md:text-[13px]", filter === k ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-2")}
          >
            {l}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <EmptyState title="Nenhum lançamento">{txs.length ? "Nada neste filtro." : "Lance o primeiro gasto no campo acima."}</EmptyState>
      ) : (
        <div className="grid gap-3">
          {days.map(([day, list]) => (
            <Card key={day}>
              <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-fg-2">
                <span>{formatLong(day)}</span>
                <span className="tabular-nums">{brl(list.reduce((s, t) => s + (t.kind === "INCOME" ? t.amount : t.kind === "EXPENSE" ? -t.amount : 0), 0), { sign: true })}</span>
              </div>
              <ul>
                {list.map((t) => (
                  <TxRow key={t.id + t.paid} t={t} showDate={false} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
