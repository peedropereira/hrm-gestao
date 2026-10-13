"use client";

import { useState, useTransition } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { autoCategorize } from "@/app/actions/finance";
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
  ["semcat", "Sem categoria"],
] as const;

export function LancView({ month, txs }: { month: string; txs: FinTxDTO[] }) {
  const { catById, accById, accounts } = useFin();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("todos");
  const [q, setQ] = useState("");
  const [acc, setAcc] = useState("");
  const [catPending, startCat] = useTransition();

  const isCard = (t: FinTxDTO) => t.cardPending || accById(t.accountId)?.type === "CREDIT_CARD";
  const shown = txs.filter((t) => {
    if (filter === "despesas" && t.kind !== "EXPENSE") return false;
    if (filter === "receitas" && t.kind !== "INCOME") return false;
    if (filter === "abertos" && (t.paid || isCard(t) || t.kind === "TRANSFER")) return false;
    if (filter === "fixos" && !t.recurringId) return false;
    if (filter === "cartao" && !isCard(t)) return false;
    if (filter === "semcat" && (t.categoryId || t.kind === "TRANSFER")) return false;
    if (acc && t.accountId !== acc && t.toAccountId !== acc) return false;
    if (q.trim()) {
      const hay = norm(`${t.description} ${catById(t.categoryId)?.name ?? ""} ${catById(t.categoryId)?.group ?? ""} ${t.notes ?? ""}`);
      if (!hay.includes(norm(q.trim()))) return false;
    }
    return true;
  });
  const income = shown.filter((t) => t.kind === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = shown.filter((t) => t.kind === "EXPENSE").reduce((s, t) => s + t.amount, 0);

  // compras de cartão ficam agrupadas na fatura; o resto, por dia
  const byInvoice = new Map<string, FinTxDTO[]>();
  const byDay = new Map<string, FinTxDTO[]>();
  for (const t of shown) {
    if (t.invoiceMonth && t.accountId) byInvoice.set(`${t.accountId}|${t.invoiceMonth}`, [...(byInvoice.get(`${t.accountId}|${t.invoiceMonth}`) ?? []), t]);
    else byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const invoices = [...byInvoice.entries()].map(([k, list]) => ({ k, acc: accById(k.split("|")[0]), list: list.sort((a, b) => b.date.localeCompare(a.date)) }));
  const uncategorized = txs.filter((t) => !t.categoryId && t.kind !== "TRANSFER").length;

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

      {uncategorized > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-amber-bg px-4 py-2.5 text-[14px] text-fg">
          <span className="min-w-0 flex-1">
            <b>{uncategorized}</b> {uncategorized === 1 ? "lançamento sem categoria" : "lançamentos sem categoria"} neste mês.
          </span>
          <Button
            size="sm"
            className="h-10 md:h-8"
            disabled={catPending}
            onClick={() =>
              startCat(async () => {
                const r = await autoCategorize();
                if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
                toast.success(r.data.done ? `${r.data.done} categorizados automaticamente${r.data.left ? ` · ${r.data.left} para você escolher` : ""}` : "Não reconheci os restantes: escolha a categoria de cada um (os iguais vão junto).");
                if (r.data.left) setFilter("semcat");
              })
            }
          >
            {catPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Categorizar automaticamente
          </Button>
          {filter !== "semcat" && (
            <Button variant="secondary" size="sm" className="h-10 md:h-8" onClick={() => setFilter("semcat")}>
              Escolher manualmente
            </Button>
          )}
        </div>
      )}

      {invoices.map(({ k, acc: a, list }) => (
        <Card key={k}>
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-fg-2">
            <span>
              Fatura {a?.name ?? "cartão"} · {list.length} {list.length === 1 ? "compra" : "compras"}
            </span>
            <span className="tabular-nums">{brl(list.reduce((s, t) => s + (t.kind === "INCOME" ? -t.amount : t.amount), 0))}</span>
          </div>
          <ul>
            {list.map((t) => (
              <TxRow key={t.id + t.paid + t.categoryId} t={t} quickCategory={filter === "semcat"} />
            ))}
          </ul>
        </Card>
      ))}

      {days.length === 0 && invoices.length === 0 ? (
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
                  <TxRow key={t.id + t.paid + t.categoryId} t={t} showDate={false} quickCategory={filter === "semcat"} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
