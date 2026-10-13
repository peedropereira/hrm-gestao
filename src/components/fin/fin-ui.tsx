"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Baby,
  Briefcase,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  GraduationCap,
  HandHeart,
  HeartPulse,
  House,
  Landmark,
  Loader2,
  Mic,
  Palmtree,
  PawPrint,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Shirt,
  Sparkles,
  Square,
  Tag,
  Trash2,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { deleteTransaction, restoreTransactions, saveTransaction, setPaid } from "@/app/actions/finance";
import { parseFin } from "@/lib/fin-parse";
import { useSpeech } from "@/lib/use-speech";
import { formatShort } from "@/lib/dates";
import { addMonth, brl, monthName, moneyInput, parseMoney, type FinAccountDTO, type FinCategoryDTO, type FinKind, type FinTxDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

// ---------- dados compartilhados ----------

type FinCtx = {
  accounts: FinAccountDTO[];
  categories: FinCategoryDTO[];
  catById: (id: string | null) => FinCategoryDTO | undefined;
  accById: (id: string | null) => FinAccountDTO | undefined;
  openTx: (t?: Partial<FinTxDTO> & { installments?: number }) => void;
};
const Ctx = createContext<FinCtx | null>(null);
export const useFin = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFin fora do FinProvider");
  return c;
};

export function FinProvider({ accounts, categories, children }: { accounts: FinAccountDTO[]; categories: FinCategoryDTO[]; children: ReactNode }) {
  const [editing, setEditing] = useState<(Partial<FinTxDTO> & { installments?: number }) | null>(null);
  const [formKey, setFormKey] = useState(0);
  const value = useMemo<FinCtx>(() => {
    const cm = new Map(categories.map((c) => [c.id, c]));
    const am = new Map(accounts.map((a) => [a.id, a]));
    return {
      accounts,
      categories,
      catById: (id) => (id ? cm.get(id) : undefined),
      accById: (id) => (id ? am.get(id) : undefined),
      openTx: (t) => {
        setFormKey((k) => k + 1);
        setEditing(t ?? {});
      },
    };
  }, [accounts, categories]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {editing && <TxForm key={formKey} initial={editing} onClose={() => setEditing(null)} />}
    </Ctx.Provider>
  );
}

// ---------- peças visuais ----------

const ICONS: Record<string, LucideIcon> = {
  house: House,
  utensils: Utensils,
  car: Car,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  baby: Baby,
  receipt: Receipt,
  shirt: Shirt,
  palmtree: Palmtree,
  "paw-print": PawPrint,
  landmark: Landmark,
  "credit-card": CreditCard,
  "piggy-bank": PiggyBank,
  "hand-heart": HandHeart,
  tag: Tag,
  briefcase: Briefcase,
  sparkles: Sparkles,
  "trending-up": TrendingUp,
  coins: Coins,
};

export function CatIcon({ cat, size = 34, kind }: { cat?: { icon: string; color: string } | null; size?: number; kind?: FinKind }) {
  const I = kind === "TRANSFER" ? ArrowLeftRight : (cat && ICONS[cat.icon]) || Tag;
  const color = kind === "TRANSFER" ? "#64748b" : (cat?.color ?? "#64748b");
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      aria-hidden="true"
    >
      <I style={{ width: size * 0.52, height: size * 0.52 }} />
    </span>
  );
}

export const TABS = [
  ["/financas", "Painel"],
  ["/financas/lancamentos", "Lançamentos"],
  ["/financas/fixos", "Fixos"],
  ["/financas/contas", "Contas e cartões"],
  ["/financas/categorias", "Categorias"],
] as const;

export function FinTabs() {
  const path = usePathname();
  const sp = useSearchParams();
  const mes = sp.get("mes");
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:px-7" aria-label="Finanças">
      {TABS.map(([href, label]) => {
        const on = path === href;
        return (
          <Link
            key={href}
            href={mes && (href === "/financas" || href === "/financas/lancamentos" || href === "/financas/categorias") ? `${href}?mes=${mes}` : href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold md:h-8 md:text-[13px]",
              on ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-2 hover:border-line-strong",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MonthSwitcher({ month }: { month: string }) {
  const router = useRouter();
  const path = usePathname();
  const { today } = useApp();
  const go = (m: string) => router.replace(`${path}?mes=${m}`, { scroll: false });
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="secondary" size="icon" className="md:size-9" aria-label="Mês anterior" onClick={() => go(addMonth(month, -1))}>
        <ChevronLeft />
      </Button>
      <b className="min-w-[150px] text-center text-[17px] md:text-[15px]">{monthName(month)}</b>
      <Button variant="secondary" size="icon" className="md:size-9" aria-label="Próximo mês" onClick={() => go(addMonth(month, 1))}>
        <ChevronRight />
      </Button>
      {month !== today.slice(0, 7) && (
        <button type="button" className="ml-1 text-[14px] font-semibold text-ac-text" onClick={() => go(today.slice(0, 7))}>
          Mês atual
        </button>
      )}
    </div>
  );
}

export function Money({ v, kind, className }: { v: number; kind?: FinKind; className?: string }) {
  return (
    <span className={cn("font-semibold tabular-nums", kind === "INCOME" ? "text-green" : kind === "TRANSFER" ? "text-fg-2" : "text-fg", className)}>
      {kind === "INCOME" ? "+" : kind === "EXPENSE" ? "-" : ""}
      {brl(v)}
    </span>
  );
}

/** Linha de lançamento com marcar pago. */
export function TxRow({ t, showDate = true }: { t: FinTxDTO; showDate?: boolean }) {
  const { catById, accById, openTx } = useFin();
  const { today } = useApp();
  const [pending, start] = useTransition();
  const [paid, setPaidLocal] = useState(t.paid);
  const cat = catById(t.categoryId);
  const acc = accById(t.accountId);
  const isCard = acc?.type === "CREDIT_CARD" || t.cardPending;
  const late = !paid && !isCard && t.kind !== "TRANSFER" && t.date < today;
  const toggle = () => {
    const next = !paid;
    setPaidLocal(next);
    start(async () => {
      const r = await setPaid(t.id, next);
      if (!r.ok) {
        setPaidLocal(!next);
        toast.error(r.error);
      }
    });
  };
  return (
    <li className="flex items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openTx(t)}>
        <CatIcon cat={cat} kind={t.kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium md:text-[14px]">{t.description}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-3">
            {showDate && <span className={cn(late && "font-semibold text-red")}>{late ? `venceu ${formatShort(t.date)}` : formatShort(t.date)}</span>}
            {cat && <span>· {cat.name}</span>}
            {acc && <span>· {acc.name}</span>}
            {t.recurringId && <Repeat className="size-3.5" aria-label="fixo" />}
          </span>
        </span>
      </button>
      <span className="text-right">
        <Money v={t.amount} kind={t.kind} className="block text-[16px] md:text-[14px]" />
        {t.kind !== "TRANSFER" && !isCard && (
          <button
            type="button"
            disabled={pending}
            onClick={toggle}
            className={cn(
              "mt-0.5 inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-semibold",
              paid ? "bg-green-bg text-green" : late ? "bg-red-bg text-red" : "bg-surface-2 text-fg-2",
            )}
          >
            {paid ? <Check className="size-3.5" /> : null}
            {paid ? (t.kind === "INCOME" ? "Recebido" : "Pago") : t.kind === "INCOME" ? "Receber" : "Pagar"}
          </button>
        )}
        {isCard && (
          <span className="mt-0.5 inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-fg-2" title="Pago junto com a fatura do cartão">
            <CreditCard className="size-3" />
            {paid ? "fatura paga" : t.cardPending ? "no cartão" : "na fatura"}
          </span>
        )}
      </span>
    </li>
  );
}

// ---------- lançamento rápido ----------

export function QuickAdd() {
  const { categories, accounts, catById, accById, openTx } = useFin();
  const { today } = useApp();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const speech = useSpeech((chunk) => setText((t) => (t ? `${t} ${chunk}` : chunk)));
  const p = text.trim() ? parseFin(text, { today, categories, accounts }) : null;

  const save = () => {
    if (!p) return;
    if (!p.amount) return void toast.error("Diga ou escreva o valor. Ex.: “mercado 230”.");
    start(async () => {
      const r = await saveTransaction({
        kind: p.kind,
        description: p.description,
        amount: p.amount!,
        date: p.date,
        paid: p.paid,
        categoryId: p.categoryId,
        accountId: p.accountId ?? accounts.find((a) => a.type === "CHECKING" && !a.archived)?.id ?? null,
        installments: p.installments,
      });
      if (!r.ok) return void toast.error(r.error);
      setText("");
      toast.success(`${p.kind === "INCOME" ? "Receita" : "Despesa"} lançada: ${brl(p.amount!)}`);
    });
  };

  return (
    <div className="grid min-w-0 gap-2">
      <form
        className="flex min-w-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor="fin-quick" className="sr-only">
          Lançamento rápido
        </label>
        <input
          id="fin-quick"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ex.: mercado 230 · gasolina 250 ontem · tv 3000 em 10x no cartão"
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-[12px] border-[1.5px] border-ac bg-bg px-3.5 text-[16px] shadow-[0_0_0_4px_var(--ac-soft)] outline-none placeholder:text-fg-3 md:h-11 md:text-[15px]"
        />
        <button
          type="button"
          onClick={() => (speech.listening ? speech.stop() : speech.start())}
          aria-label={speech.listening ? "Parar de ouvir" : "Falar"}
          className={cn("grid size-11 shrink-0 place-items-center rounded-full", speech.listening ? "animate-pulse bg-red-solid text-white" : "bg-surface-2 text-fg-2")}
        >
          {speech.listening ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
        </button>
        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={pending || !p?.amount} aria-label="Lançar">
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
      </form>
      {speech.error && <p className="px-1 text-[13px] text-amber">{speech.error}</p>}
      {p && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[14px] text-fg-2">
          <b className={p.kind === "INCOME" ? "text-green" : "text-fg"}>{p.kind === "INCOME" ? "Receita" : "Despesa"}</b>
          <span>{p.description}</span>
          <span>· {p.amount ? brl(p.amount) : <span className="text-amber">sem valor</span>}</span>
          {p.installments > 1 && <span>· {p.installments}x</span>}
          <span>· {formatShort(p.date)}</span>
          <span>· {catById(p.categoryId)?.name ?? <span className="text-fg-3">sem categoria</span>}</span>
          {accById(p.accountId) && <span>· {accById(p.accountId)!.name}</span>}
          <button
            type="button"
            className="font-semibold text-ac-text"
            onClick={() => {
              openTx({ kind: p.kind, description: p.description, amount: p.amount ?? 0, date: p.date, categoryId: p.categoryId, accountId: p.accountId, paid: p.paid, installments: p.installments });
              setText("");
            }}
          >
            Ajustar
          </button>
        </p>
      )}
    </div>
  );
}

// ---------- formulário ----------

const inputCls =
  "h-12 w-full min-w-0 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[14px]";
const lbl = "text-[15px] font-semibold md:text-[13px]";

export function CategorySelect({ id, kind, value, onChange }: { id: string; kind: "EXPENSE" | "INCOME"; value: string; onChange: (v: string) => void }) {
  const { categories } = useFin();
  const groups = useMemo(() => {
    const m = new Map<string, FinCategoryDTO[]>();
    for (const c of categories.filter((x) => x.kind === kind && (!x.archived || x.id === value))) m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m.entries()];
  }, [categories, kind, value]);
  return (
    <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sem categoria</option>
      {groups.map(([g, cs]) => (
        <optgroup key={g} label={g}>
          {cs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export const CARD_PENDING = "__cartao__";

export function AccountSelect({
  id,
  value,
  onChange,
  placeholder = "Sem conta",
  excludeCards,
  allowCardPending,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  excludeCards?: boolean;
  allowCardPending?: boolean;
}) {
  const { accounts } = useFin();
  return (
    <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {allowCardPending && <option value={CARD_PENDING}>Cartão de crédito (identificar na fatura)</option>}
      {accounts
        .filter((a) => (!a.archived || a.id === value) && !(excludeCards && a.type === "CREDIT_CARD"))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.type === "CREDIT_CARD" ? " (cartão)" : ""}
          </option>
        ))}
    </select>
  );
}

function TxForm({ initial, onClose }: { initial: Partial<FinTxDTO> & { installments?: number }; onClose: () => void }) {
  const { today } = useApp();
  const { accounts, accById } = useFin();
  const [pending, start] = useTransition();
  const editing = !!initial.id;
  const [f, setF] = useState({
    kind: (initial.kind ?? "EXPENSE") as FinKind,
    description: initial.description ?? "",
    amount: initial.amount ? moneyInput(initial.amount) : "",
    date: initial.date ?? today,
    paid: initial.paid ?? true,
    categoryId: initial.categoryId ?? "",
    accountId: initial.cardPending ? CARD_PENDING : (initial.accountId ?? accounts.find((a) => a.type === "CHECKING" && !a.archived)?.id ?? ""),
    toAccountId: initial.toAccountId ?? "",
    installments: String(initial.installments ?? 1),
    notes: initial.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const pendingCard = f.accountId === CARD_PENDING;
  const isCard = accById(f.accountId)?.type === "CREDIT_CARD" || pendingCard;
  const isInstallment = !!initial.installmentGroup;

  const submit = (scope: "one" | "following" = "one") =>
    start(async () => {
      const amount = parseMoney(f.amount);
      if (!amount) return void toast.error("Informe o valor.");
      const r = await saveTransaction(
        {
          kind: f.kind,
          description: f.description,
          amount,
          date: f.date,
          paid: f.paid,
          categoryId: f.categoryId || null,
          accountId: pendingCard ? null : f.accountId || null,
          toAccountId: f.toAccountId || null,
          cardPending: pendingCard,
          installments: editing ? 1 : Number(f.installments) || 1,
          notes: f.notes,
        },
        initial.id,
        scope,
      );
      if (!r.ok) return void toast.error(r.error);
      toast.success(editing ? "Lançamento atualizado" : "Lançamento criado");
      onClose();
    });

  const remove = (scope: "one" | "following") =>
    start(async () => {
      const r = await deleteTransaction(initial.id!, scope);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
      const ids = r.data.ids;
      toast.success(ids.length > 1 ? `${ids.length} parcelas excluídas` : "Lançamento excluído", { action: { label: "Desfazer", onClick: () => void restoreTransactions(ids) } });
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title={editing ? "Editar lançamento" : "Novo lançamento"}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-3 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="Tipo">
          {(
            [
              ["EXPENSE", "Despesa"],
              ["INCOME", "Receita"],
              ["TRANSFER", "Transferência"],
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
        <div className="grid grid-cols-[1.3fr_1fr] gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="tx-amount" className={lbl}>
              Valor (R$)
            </label>
            <input id="tx-amount" inputMode="decimal" className={cn(inputCls, "text-[20px] font-bold md:text-[18px]")} value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" required data-autofocus />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="tx-date" className={lbl}>
              {f.kind === "EXPENSE" && !isCard ? "Data / vencimento" : "Data"}
            </label>
            <input id="tx-date" type="date" className={inputCls} value={f.date} onChange={(e) => set("date", e.target.value)} required />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="tx-desc" className={lbl}>
            Descrição
          </label>
          <input id="tx-desc" className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="ex.: Supermercado do mês" required />
        </div>
        {f.kind === "TRANSFER" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="tx-from" className={lbl}>
                De
              </label>
              <AccountSelect id="tx-from" value={f.accountId} onChange={(v) => set("accountId", v)} placeholder="Escolha" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="tx-to" className={lbl}>
                Para
              </label>
              <AccountSelect id="tx-to" value={f.toAccountId} onChange={(v) => set("toAccountId", v)} placeholder="Escolha" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="tx-cat" className={lbl}>
                Categoria
              </label>
              <CategorySelect id="tx-cat" kind={f.kind} value={f.categoryId} onChange={(v) => set("categoryId", v)} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="tx-acc" className={lbl}>
                {f.kind === "INCOME" ? "Entrou em" : "Pago com"}
              </label>
              <AccountSelect id="tx-acc" value={f.accountId} onChange={(v) => set("accountId", v)} allowCardPending={f.kind === "EXPENSE"} />
            </div>
          </div>
        )}
        {f.kind === "EXPENSE" && !editing && (
          <div className="grid gap-1.5">
            <label htmlFor="tx-inst" className={lbl}>
              Parcelas
            </label>
            <select id="tx-inst" className={inputCls} value={f.installments} onChange={(e) => set("installments", e.target.value)}>
              <option value="1">À vista</option>
              {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}x{parseMoney(f.amount) ? ` de ${brl(parseMoney(f.amount)! / n)}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {f.kind !== "TRANSFER" && !isCard && (
          <label className="flex items-center gap-2.5 text-[15px] md:text-[14px]">
            <input type="checkbox" className="size-5 accent-[var(--ac)]" checked={f.paid} onChange={(e) => set("paid", e.target.checked)} />
            {f.kind === "INCOME" ? "Já recebido" : "Já pago"}
            {!f.paid && <span className="text-[13px] text-fg-3">(fica em “a pagar” até você marcar)</span>}
          </label>
        )}
        {isCard && (
          <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
            {pendingCard
              ? "Cobrado em cartão: quando você importar a fatura, este gasto é reconhecido e abatido nela. Só é pago junto com a fatura."
              : "Compra no cartão: entra na fatura e é paga quando você pagar a fatura em “Contas e cartões”."}
          </p>
        )}
        <div className="grid gap-1.5">
          <label htmlFor="tx-notes" className={lbl}>
            Observação (opcional)
          </label>
          <input id="tx-notes" className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Button type="submit" block disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            {editing ? "Salvar" : "Lançar"}
          </Button>
          {editing && isInstallment && (
            <Button variant="secondary" block disabled={pending} onClick={() => submit("following")}>
              Salvar nesta e nas próximas parcelas
            </Button>
          )}
          {editing && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="quiet" disabled={pending} onClick={() => remove("one")}>
                <Trash2 /> Excluir
              </Button>
              {isInstallment && (
                <Button variant="quiet" disabled={pending} onClick={() => remove("following")}>
                  <Trash2 /> Esta e próximas
                </Button>
              )}
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
}

export function NewTxButton({ label = "Novo lançamento" }: { label?: string }) {
  const { openTx } = useFin();
  return (
    <Button size="sm" className="h-11 md:h-9" onClick={() => openTx()}>
      <Plus /> {label}
    </Button>
  );
}
