"use client";

import { useState, useTransition } from "react";
import { ClipboardList, CreditCard, Loader2, Plus, Repeat, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Card, EmptyState, PanelHead } from "@/components/ds";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { AccountSelect, CARD_PENDING, CatIcon, CategorySelect, useFin } from "@/components/fin/fin-ui";
import { endRecurring, importRecurring, saveRecurring } from "@/app/actions/finance";
import { parseFixedList, type FixedLine } from "@/lib/fin-parse";
import { brl, monthAbbr, moneyInput, parseMoney, type FinRecurringDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

const inputCls =
  "h-12 w-full min-w-0 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[14px]";
const lbl = "text-[15px] font-semibold md:text-[13px]";

export function FixosView({ items }: { items: FinRecurringDTO[] }) {
  const { catById, accById } = useFin();
  const [form, setForm] = useState<Partial<FinRecurringDTO> | null>(null);
  const [importing, setImporting] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  const active = items.filter((r) => r.active);
  const ended = items.filter((r) => !r.active);
  const out = active.filter((r) => r.kind === "EXPENSE");
  const inc = active.filter((r) => r.kind === "INCOME");
  const totalOut = out.reduce((t, r) => t + r.amount, 0);
  const totalIn = inc.reduce((t, r) => t + r.amount, 0);

  const byGroup = new Map<string, FinRecurringDTO[]>();
  for (const r of out) {
    const g = catById(r.categoryId)?.group ?? "Sem categoria";
    byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
  }
  const groups = [...byGroup.entries()].map(([g, l]) => ({ g, l, total: l.reduce((t, r) => t + r.amount, 0) })).sort((a, b) => b.total - a.total);

  const row = (r: FinRecurringDTO) => {
    const cat = catById(r.categoryId);
    return (
      <li key={r.id} className="border-t border-line first:border-t-0">
        <button type="button" onClick={() => setForm(r)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2">
          <CatIcon cat={cat} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-medium md:text-[14px]">{r.description}</span>
            <span className="flex flex-wrap gap-x-1.5 text-[13px] text-fg-3">
              <span>todo dia {r.dayOfMonth}</span>
              {cat && <span>· {cat.name}</span>}
              {accById(r.accountId) && <span>· {accById(r.accountId)!.name}</span>}
              {r.endMonth && <span>· até {monthAbbr(r.endMonth)}</span>}
            </span>
          </span>
          <span className="text-right">
            <b className={cn("block text-[16px] tabular-nums md:text-[14px]", r.kind === "INCOME" && "text-green")}>
              {r.variable && "~"}
              {brl(r.amount)}
            </b>
            <span className="flex justify-end gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-3">
              {r.variable && <span>varia</span>}
              {r.onCard && (
                <span className="inline-flex items-center gap-0.5">
                  <CreditCard className="size-3" /> cartão
                </span>
              )}
              {r.autoPaid && (
                <span className="inline-flex items-center gap-0.5">
                  <Zap className="size-3" /> débito
                </span>
              )}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <Card className="grid gap-0.5 px-4 py-3.5">
          <span className="text-[14px] font-medium text-fg-3 md:text-[13px]">Gastos fixos por mês</span>
          <b className="text-[24px] font-bold tabular-nums md:text-[22px]">{brl(totalOut)}</b>
          <span className="text-[13px] text-fg-3">{out.length} itens</span>
        </Card>
        <Card className="grid gap-0.5 px-4 py-3.5">
          <span className="text-[14px] font-medium text-fg-3 md:text-[13px]">Receitas fixas</span>
          <b className="text-[24px] font-bold tabular-nums text-green md:text-[22px]">{brl(totalIn)}</b>
          <span className="text-[13px] text-fg-3">{totalIn ? `fixos usam ${Math.round((totalOut / totalIn) * 100)}% da renda` : "cadastre seu salário"}</span>
        </Card>
        <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1 md:justify-end">
          <Button size="sm" className="h-11 md:h-9" onClick={() => setForm({})}>
            <Plus /> Novo fixo
          </Button>
          <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => setImporting(true)}>
            <ClipboardList /> Colar lista
          </Button>
        </div>
      </div>
      <p className="-mt-1 flex items-center gap-1.5 text-[14px] text-fg-3">
        <Repeat className="size-4" /> Cada fixo vira um lançamento “a pagar” todo mês. Quando pagar, é só marcar.
      </p>

      {active.length === 0 ? (
        <EmptyState title="Nenhum gasto fixo ainda">
          <p>Cadastre um por um ou cole a lista inteira (ex.: “Aluguel 2.500 dia 5”).</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button onClick={() => setImporting(true)}>
              <ClipboardList /> Colar lista
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
          {inc.length > 0 && (
            <Card>
              <PanelHead title="Receitas fixas" count={inc.length}>
                <span className="text-[14px] font-semibold text-green tabular-nums md:text-[13px]">{brl(totalIn)}</span>
              </PanelHead>
              <ul>{inc.map(row)}</ul>
            </Card>
          )}
          {groups.map(({ g, l, total }) => (
            <Card key={g}>
              <PanelHead title={g} count={l.length}>
                <span className="text-[14px] font-semibold tabular-nums md:text-[13px]">{brl(total)}</span>
              </PanelHead>
              <ul>{l.map(row)}</ul>
            </Card>
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <div>
          <button type="button" className="text-[14px] font-semibold text-fg-3 underline" onClick={() => setShowEnded(!showEnded)}>
            {showEnded ? "Esconder" : "Mostrar"} encerrados ({ended.length})
          </button>
          {showEnded && (
            <Card className="mt-2 opacity-75">
              <ul>{ended.map(row)}</ul>
            </Card>
          )}
        </div>
      )}

      {form && <RecForm key={form.id ?? "novo"} initial={form} onClose={() => setForm(null)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </div>
  );
}

function RecForm({ initial, onClose }: { initial: Partial<FinRecurringDTO>; onClose: () => void }) {
  const { today } = useApp();
  const [pending, start] = useTransition();
  const editing = !!initial.id;
  const [f, setF] = useState({
    kind: initial.kind ?? ("EXPENSE" as "EXPENSE" | "INCOME"),
    description: initial.description ?? "",
    amount: initial.amount ? moneyInput(initial.amount) : "",
    categoryId: initial.categoryId ?? "",
    accountId: initial.onCard ? CARD_PENDING : (initial.accountId ?? ""),
    dayOfMonth: String(initial.dayOfMonth ?? 5),
    startMonth: initial.startMonth ?? today.slice(0, 7),
    endMonth: initial.endMonth ?? "",
    variable: initial.variable ?? false,
    autoPaid: initial.autoPaid ?? false,
    notes: initial.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = () =>
    start(async () => {
      const amount = parseMoney(f.amount);
      if (!amount) return void toast.error("Informe o valor.");
      const r = await saveRecurring(
        {
          kind: f.kind,
          description: f.description,
          amount,
          categoryId: f.categoryId || null,
          accountId: f.accountId === CARD_PENDING ? null : f.accountId || null,
          onCard: f.accountId === CARD_PENDING,
          dayOfMonth: Number(f.dayOfMonth),
          startMonth: f.startMonth,
          endMonth: f.endMonth || null,
          variable: f.variable,
          autoPaid: f.autoPaid,
          notes: f.notes,
        },
        initial.id,
      );
      if (!r.ok) return void toast.error(r.error);
      toast.success(editing ? "Fixo atualizado (meses futuros também)" : "Fixo cadastrado");
      onClose();
    });

  const end = () =>
    start(async () => {
      const r = await endRecurring(initial.id!);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Fixo encerrado", { action: { label: "Desfazer", onClick: () => void endRecurring(initial.id!, true) } });
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title={editing ? "Editar fixo" : "Novo gasto ou receita fixa"}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="Tipo">
          {(
            [
              ["EXPENSE", "Gasto fixo"],
              ["INCOME", "Receita fixa"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.kind === k}
              onClick={() => setF((x) => ({ ...x, kind: k, categoryId: "" }))}
              className={cn("h-11 rounded-[9px] text-[14px] font-semibold text-fg-2 md:h-9", f.kind === k && "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--line)]")}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="rec-desc" className={lbl}>
            Descrição
          </label>
          <input id="rec-desc" className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="ex.: Aluguel, Plano de saúde" required data-autofocus />
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="rec-amount" className={lbl}>
              Valor (R$)
            </label>
            <input id="rec-amount" inputMode="decimal" className={cn(inputCls, "font-bold")} value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" required />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="rec-day" className={lbl}>
              Vence todo dia
            </label>
            <input id="rec-day" type="number" min={1} max={31} className={inputCls} value={f.dayOfMonth} onChange={(e) => set("dayOfMonth", e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="rec-cat" className={lbl}>
              Categoria
            </label>
            <CategorySelect id="rec-cat" kind={f.kind} value={f.categoryId} onChange={(v) => set("categoryId", v)} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="rec-acc" className={lbl}>
              {f.kind === "INCOME" ? "Entra em" : "Pago com"}
            </label>
            <AccountSelect id="rec-acc" value={f.accountId} onChange={(v) => set("accountId", v)} allowCardPending={f.kind === "EXPENSE"} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="rec-start" className={lbl}>
              Começa em
            </label>
            <input id="rec-start" type="month" className={inputCls} value={f.startMonth} onChange={(e) => set("startMonth", e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="rec-end" className={lbl}>
              Termina em (opcional)
            </label>
            <input id="rec-end" type="month" className={inputCls} value={f.endMonth} onChange={(e) => set("endMonth", e.target.value)} />
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-[15px] md:text-[14px]">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--ac)]" checked={f.variable} onChange={(e) => set("variable", e.target.checked)} />
          <span>
            O valor muda todo mês
            <span className="block text-[13px] text-fg-3">Ex.: luz, água. O valor acima vira estimativa; ajuste quando a conta chegar.</span>
          </span>
        </label>
        <label className={cn("flex items-start gap-2.5 text-[15px] md:text-[14px]", f.accountId === CARD_PENDING && "hidden")}>
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--ac)]" checked={f.autoPaid} onChange={(e) => set("autoPaid", e.target.checked)} />
          <span>
            Débito automático
            <span className="block text-[13px] text-fg-3">Marca como pago sozinho no dia do vencimento.</span>
          </span>
        </label>
        <Button type="submit" block disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {editing ? "Salvar" : "Cadastrar"}
        </Button>
        {editing && initial.active && (
          <Button variant="quiet" block disabled={pending} onClick={end}>
            <Trash2 /> Encerrar este fixo
          </Button>
        )}
      </form>
    </Sheet>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const { categories } = useFin();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<FixedLine[] | null>(null);
  const [accountId, setAccountId] = useState("");

  const read = () => {
    const r = parseFixedList(text, categories);
    if (!r.length) return void toast.error("Cole pelo menos uma linha.");
    setRows(r);
  };
  const upd = (i: number, patch: Partial<FixedLine>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const valid = rows?.filter((r) => r.amount && r.amount > 0) ?? [];

  const save = () =>
    start(async () => {
      const r = await importRecurring(
        valid.map((x) => ({ description: x.description, amount: x.amount!, dayOfMonth: x.dayOfMonth, categoryId: x.categoryId, kind: x.kind, variable: x.variable })),
        accountId || null,
      );
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.data?.count} fixos cadastrados`);
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title="Colar lista de fixos" description="Uma linha por item: nome, valor e dia do vencimento." wide>
      {!rows ? (
        <div className="grid gap-3">
          <label htmlFor="imp-text" className="sr-only">
            Lista
          </label>
          <textarea
            id="imp-text"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-autofocus
            placeholder={"Aluguel 2.500,00 dia 5\nCondomínio 850 dia 10\nLuz ~300 dia 15 (varia)\nInternet 120 dia 20\nPlano de saúde 1.200 dia 1\nSalário 12.000 dia 5"}
            className="w-full rounded-[12px] border border-line-strong bg-bg p-3.5 font-mono text-[15px] leading-relaxed outline-none focus:border-ac md:text-[14px]"
          />
          <p className="text-[13px] text-fg-3">Escreva “varia” nas contas que mudam de valor. Linhas com “salário” ou “receita” entram como receita.</p>
          <Button block onClick={read} disabled={!text.trim()}>
            Ler a lista
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[14px] text-fg-2">Confira e ajuste antes de salvar. Linhas sem valor ficam de fora.</p>
          <ul className="grid gap-2">
            {rows.map((r, i) => (
              <li key={i} className={cn("grid gap-2 rounded-[12px] border border-line p-2.5", !r.amount && "opacity-60")}>
                <div className="grid grid-cols-[1fr_110px_64px] gap-2">
                  <input aria-label="Descrição" className={inputCls} value={r.description} onChange={(e) => upd(i, { description: e.target.value })} />
                  <input aria-label="Valor" inputMode="decimal" className={cn(inputCls, "text-right font-semibold")} value={r.amount ? moneyInput(r.amount) : ""} placeholder="valor" onChange={(e) => upd(i, { amount: parseMoney(e.target.value) })} />
                  <input aria-label="Dia" type="number" min={1} max={31} className={inputCls} value={r.dayOfMonth} onChange={(e) => upd(i, { dayOfMonth: Number(e.target.value) || 1 })} />
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <CategorySelect id={`imp-cat-${i}`} kind={r.kind} value={r.categoryId ?? ""} onChange={(v) => upd(i, { categoryId: v || null })} />
                  <label className="flex items-center gap-1.5 text-[13px] text-fg-2">
                    <input type="checkbox" className="size-4 accent-[var(--ac)]" checked={r.variable} onChange={(e) => upd(i, { variable: e.target.checked })} /> varia
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="grid gap-1.5">
            <label htmlFor="imp-acc" className={lbl}>
              Pagos com (opcional)
            </label>
            <AccountSelect id="imp-acc" value={accountId} onChange={setAccountId} placeholder="Definir depois" />
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" onClick={() => setRows(null)}>
              Voltar
            </Button>
            <Button onClick={save} disabled={pending || !valid.length}>
              {pending && <Loader2 className="animate-spin" />} Cadastrar {valid.length} {valid.length === 1 ? "fixo" : "fixos"} · {brl(valid.filter((x) => x.kind === "EXPENSE").reduce((t, x) => t + x.amount!, 0))}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
