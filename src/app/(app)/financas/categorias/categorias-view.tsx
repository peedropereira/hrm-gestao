"use client";

import { useState, useTransition } from "react";
import { Archive, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, PanelHead } from "@/components/ds";
import { Button } from "@/components/button";
import { CatIcon, MonthSwitcher, useFin } from "@/components/fin/fin-ui";
import { archiveCategory, saveCategory, setBudget } from "@/app/actions/finance";
import { brl, moneyInput, parseMoney, type FinCategoryDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

function BudgetInput({ c }: { c: FinCategoryDTO }) {
  const [v, setV] = useState(c.budget ? moneyInput(c.budget) : "");
  const [, start] = useTransition();
  const commit = () => {
    const n = v.trim() ? parseMoney(v) : null;
    if (n === (c.budget ?? null)) return;
    if (v.trim() && n === null) return void toast.error("Valor inválido.");
    start(async () => {
      const r = await setBudget(c.id, n);
      if (!r.ok) toast.error(r.error);
      else toast.success(n ? `Orçamento de ${c.name}: ${brl(n)}` : "Orçamento removido");
    });
  };
  return (
    <input
      aria-label={`Orçamento de ${c.name}`}
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      placeholder="orçamento"
      className="h-10 w-[112px] rounded-[10px] border border-line bg-bg px-2.5 text-right text-[15px] outline-none placeholder:text-fg-3 focus:border-ac md:h-8 md:text-[13px]"
    />
  );
}

export function CategoriasView({ month, spent }: { month: string; spent: Record<string, number> }) {
  const { categories } = useFin();
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [pending, start] = useTransition();

  const list = categories.filter((c) => c.kind === kind && !c.archived);
  const groups = new Map<string, FinCategoryDTO[]>();
  for (const c of list) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const totalBudget = list.reduce((t, c) => t + (c.budget ?? 0), 0);
  const totalSpent = list.reduce((t, c) => t + (spent[c.id] ?? 0), 0);

  const add = (group: string) =>
    start(async () => {
      if (!name.trim()) return;
      const r = await saveCategory({ name: name.trim(), kind, group });
      if (!r.ok) return void toast.error(r.error);
      setName("");
      setAdding(null);
      setNewGroup("");
      toast.success("Categoria criada");
    });

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} />
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="Tipo">
          {(
            [
              ["EXPENSE", "Despesas"],
              ["INCOME", "Receitas"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("h-10 rounded-[9px] px-4 text-[14px] font-semibold text-fg-2 md:h-8", kind === k && "bg-surface text-fg shadow-[var(--shadow-sm)]")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {kind === "EXPENSE" && (
        <p className="text-[15px] text-fg-2 md:text-[14px]">
          Gasto no mês <b className="tabular-nums">{brl(totalSpent)}</b>
          {totalBudget > 0 && (
            <>
              {" "}
              de <b className="tabular-nums">{brl(totalBudget)}</b> orçados ·{" "}
              <span className={totalSpent > totalBudget ? "font-semibold text-red" : "text-green"}>{totalSpent > totalBudget ? `${brl(totalSpent - totalBudget)} acima` : `${brl(totalBudget - totalSpent)} livres`}</span>
            </>
          )}
          . Defina um orçamento por categoria para acompanhar no Painel.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {[...groups.entries()].map(([g, cs]) => {
          const gSpent = cs.reduce((t, c) => t + (spent[c.id] ?? 0), 0);
          return (
            <Card key={g}>
              <PanelHead
                title={
                  <span className="flex items-center gap-2">
                    <CatIcon cat={cs[0]} size={26} /> {g}
                  </span>
                }
              >
                <span className="text-[14px] font-semibold tabular-nums md:text-[13px]">{brl(gSpent)}</span>
              </PanelHead>
              <ul>
                {cs.map((c) => {
                  const s = spent[c.id] ?? 0;
                  const over = c.budget != null && s > c.budget;
                  return (
                    <li key={c.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-line px-3.5 py-2 first:border-t-0">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] md:text-[14px]">{c.name}</span>
                        <span className={cn("text-[13px] tabular-nums", over ? "font-semibold text-red" : "text-fg-3")}>
                          {brl(s)}
                          {c.budget != null && ` de ${brl(c.budget)}`}
                        </span>
                        {c.budget ? (
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (s / c.budget) * 100)}%`, background: over ? "var(--red-solid)" : c.color }} />
                          </span>
                        ) : null}
                      </span>
                      {kind === "EXPENSE" ? <BudgetInput c={c} /> : <span />}
                      <button
                        type="button"
                        aria-label={`Arquivar ${c.name}`}
                        className="grid size-9 place-items-center rounded-[8px] text-fg-3 hover:bg-surface-2"
                        onClick={() =>
                          void archiveCategory(c.id).then((r) =>
                            r.ok ? toast.success("Categoria arquivada", { action: { label: "Desfazer", onClick: () => void archiveCategory(c.id, false) } }) : toast.error(r.error),
                          )
                        }
                      >
                        <Archive className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {adding === g ? (
                <form
                  className="flex gap-2 border-t border-line p-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    add(g);
                  }}
                >
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da categoria" aria-label="Nome da categoria" className="h-10 min-w-0 flex-1 rounded-[10px] border border-line-strong bg-bg px-3 text-[16px] outline-none focus:border-ac md:text-[14px]" />
                  <Button type="submit" size="sm" className="h-10" disabled={pending || !name.trim()}>
                    Criar
                  </Button>
                </form>
              ) : (
                <button type="button" className="w-full border-t border-line px-3.5 py-2.5 text-left text-[14px] font-semibold text-ac-text hover:bg-surface-2" onClick={() => setAdding(g)}>
                  + Categoria em {g}
                </button>
              )}
            </Card>
          );
        })}
        <Card className="p-3.5">
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newGroup.trim()) add(newGroup.trim());
            }}
          >
            <b className="text-[15px] md:text-[14px]">Novo grupo</b>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Nome do grupo (ex.: Igreja, Carro 2)" aria-label="Nome do grupo" className="h-11 rounded-[10px] border border-line-strong bg-bg px-3 text-[16px] outline-none focus:border-ac md:h-10 md:text-[14px]" />
            <input value={adding === null ? name : ""} onChange={(e) => setName(e.target.value)} placeholder="Primeira categoria do grupo" aria-label="Primeira categoria" className="h-11 rounded-[10px] border border-line-strong bg-bg px-3 text-[16px] outline-none focus:border-ac md:h-10 md:text-[14px]" />
            <Button type="submit" size="sm" className="h-11 md:h-9" disabled={pending || !newGroup.trim() || !name.trim()}>
              <Plus /> Criar grupo
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
