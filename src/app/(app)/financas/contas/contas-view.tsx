"use client";

import { useState, useTransition } from "react";
import { Archive, CreditCard, Landmark, Loader2, Pencil, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Card, PanelHead } from "@/components/ds";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { AccountSelect, TxRow } from "@/components/fin/fin-ui";
import { archiveAccount, payInvoice, saveAccount } from "@/app/actions/finance";
import { formatShort } from "@/lib/dates";
import { ACCOUNT_TYPE_LABEL, brl, monthName, moneyInput, parseMoney, type FinAccountDTO, type FinAccountType, type FinInvoiceDTO, type FinTxDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

const inputCls =
  "h-12 w-full min-w-0 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[14px]";
const lbl = "text-[15px] font-semibold md:text-[13px]";
const COLORS = ["#0e6e7e", "#7c3aed", "#ea580c", "#16a34a", "#2563eb", "#db2777", "#475569", "#ca8a04"];

export function ContasView({ accounts, invoices, cardTx }: { accounts: FinAccountDTO[]; invoices: FinInvoiceDTO[]; cardTx: FinTxDTO[] }) {
  const { today } = useApp();
  const [form, setForm] = useState<Partial<FinAccountDTO> | null>(null);
  const [paying, setPaying] = useState<FinInvoiceDTO | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const live = accounts.filter((a) => !a.archived);
  const banks = live.filter((a) => a.type !== "CREDIT_CARD");
  const cards = live.filter((a) => a.type === "CREDIT_CARD");
  const total = banks.reduce((t, a) => t + a.balance, 0);

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-fg-2 md:text-[14px]">
          Saldo total: <b className={cn("text-[18px] tabular-nums", total < 0 ? "text-red" : "text-fg")}>{brl(total)}</b>
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => setForm({ type: "CREDIT_CARD" })}>
            <CreditCard /> Novo cartão
          </Button>
          <Button size="sm" className="h-11 md:h-9" onClick={() => setForm({ type: "CHECKING" })}>
            <Plus /> Nova conta
          </Button>
        </div>
      </div>

      <Card>
        <PanelHead title="Contas" count={banks.length} />
        <ul>
          {banks.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-t border-line px-3.5 py-3 first:border-t-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] text-white" style={{ background: a.color }}>
                {a.type === "CASH" ? <Wallet className="size-5" /> : <Landmark className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[16px] font-semibold md:text-[14px]">{a.name}</b>
                <span className="text-[13px] text-fg-3">{ACCOUNT_TYPE_LABEL[a.type]}</span>
              </span>
              <b className={cn("text-[17px] tabular-nums md:text-[15px]", a.balance < 0 && "text-red")}>{brl(a.balance)}</b>
              <Button variant="quiet" size="icon" className="size-10 md:size-9" aria-label={`Editar ${a.name}`} onClick={() => setForm(a)}>
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-fg-3">O saldo considera o saldo inicial e o que já foi pago ou recebido. Contas em aberto não descontam até você marcar como pagas.</p>
      </Card>

      {cards.map((c) => {
        const open = invoices.filter((i) => i.accountId === c.id && !i.paid && i.total > 0);
        const current = open[0];
        const used = Math.max(0, -c.balance);
        const items = current ? cardTx.filter((t) => t.accountId === c.id && t.invoiceMonth === current.month) : [];
        return (
          <Card key={c.id}>
            <div className="flex items-center gap-3 border-b border-line px-3.5 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] text-white" style={{ background: c.color }}>
                <CreditCard className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[16px] font-semibold md:text-[14px]">{c.name}</b>
                <span className="text-[13px] text-fg-3">
                  fecha dia {c.closingDay} · vence dia {c.dueDay}
                </span>
              </span>
              <Button variant="quiet" size="icon" className="size-10 md:size-9" aria-label={`Editar ${c.name}`} onClick={() => setForm(c)}>
                <Pencil />
              </Button>
            </div>
            <div className="grid gap-3 p-3.5">
              {c.creditLimit ? (
                <div>
                  <div className="flex justify-between text-[13px] text-fg-3">
                    <span>Limite usado {brl(used)}</span>
                    <span>disponível {brl(Math.max(0, c.creditLimit - used))}</span>
                  </div>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (used / c.creditLimit) * 100)}%`, background: used / c.creditLimit > 0.8 ? "var(--red-solid)" : c.color }} />
                  </span>
                </div>
              ) : null}
              {current ? (
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <span>
                    <span className="block text-[13px] text-fg-3">Fatura de {monthName(current.month).toLowerCase()}</span>
                    <b className="text-[24px] tabular-nums md:text-[22px]">{brl(current.total)}</b>
                    <span className={cn("block text-[13px]", current.dueDate < today ? "font-semibold text-red" : "text-fg-3")}>
                      {current.dueDate < today ? "venceu" : "vence"} {formatShort(current.dueDate)}
                    </span>
                  </span>
                  <Button size="sm" className="h-11 md:h-9" onClick={() => setPaying(current)}>
                    Pagar fatura
                  </Button>
                </div>
              ) : (
                <p className="text-[15px] text-fg-3">Nenhuma fatura em aberto.</p>
              )}
              {open.length > 1 && (
                <p className="text-[13px] text-fg-3">
                  Próximas: {open.slice(1, 4).map((i) => `${monthName(i.month).split(" ")[0].toLowerCase()} ${brl(i.total)}`).join(" · ")}
                </p>
              )}
            </div>
            {items.length > 0 && (
              <details className="border-t border-line">
                <summary className="cursor-pointer px-3.5 py-2.5 text-[14px] font-semibold text-ac-text">Ver {items.length} compras desta fatura</summary>
                <ul>
                  {items.map((t) => (
                    <TxRow key={t.id} t={t} />
                  ))}
                </ul>
              </details>
            )}
          </Card>
        );
      })}

      {accounts.some((a) => a.archived) && (
        <div>
          <button type="button" className="text-[14px] font-semibold text-fg-3 underline" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Esconder" : "Mostrar"} arquivadas
          </button>
          {showArchived && (
            <Card className="mt-2">
              <ul>
                {accounts
                  .filter((a) => a.archived)
                  .map((a) => (
                    <li key={a.id} className="flex items-center justify-between border-t border-line px-3.5 py-2.5 first:border-t-0">
                      <span>{a.name}</span>
                      <Button size="sm" variant="secondary" onClick={() => void archiveAccount(a.id, false)}>
                        Reativar
                      </Button>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {form && <AccForm key={form.id ?? form.type} initial={form} onClose={() => setForm(null)} />}
      {paying && <PaySheet invoice={paying} card={accounts.find((a) => a.id === paying.accountId)!} onClose={() => setPaying(null)} />}
    </div>
  );
}

function AccForm({ initial, onClose }: { initial: Partial<FinAccountDTO>; onClose: () => void }) {
  const [pending, start] = useTransition();
  const editing = !!initial.id;
  const [f, setF] = useState({
    name: initial.name ?? "",
    type: (initial.type ?? "CHECKING") as FinAccountType,
    initialBalance: moneyInput(initial.initialBalance ?? 0),
    color: initial.color ?? (initial.type === "CREDIT_CARD" ? "#7c3aed" : "#0e6e7e"),
    closingDay: String(initial.closingDay ?? ""),
    dueDay: String(initial.dueDay ?? ""),
    creditLimit: initial.creditLimit ? moneyInput(initial.creditLimit) : "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const card = f.type === "CREDIT_CARD";

  const submit = () =>
    start(async () => {
      const r = await saveAccount(
        {
          name: f.name,
          type: f.type,
          initialBalance: f.initialBalance.trim() ? (parseMoney(f.initialBalance.replace("-", "")) ?? 0) * (f.initialBalance.trim().startsWith("-") ? -1 : 1) : 0,
          color: f.color,
          closingDay: card ? Number(f.closingDay) || null : null,
          dueDay: card ? Number(f.dueDay) || null : null,
          creditLimit: card ? parseMoney(f.creditLimit) : null,
        },
        initial.id,
      );
      if (!r.ok) return void toast.error(r.error);
      toast.success(editing ? "Salvo" : card ? "Cartão cadastrado" : "Conta cadastrada");
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title={editing ? `Editar ${initial.name}` : card ? "Novo cartão de crédito" : "Nova conta"}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor="acc-name" className={lbl}>
            Nome
          </label>
          <input id="acc-name" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={card ? "ex.: Nubank, Itaú Visa" : "ex.: Itaú, Nubank, Carteira"} required data-autofocus />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="acc-type" className={lbl}>
            Tipo
          </label>
          <select id="acc-type" className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value as FinAccountType)}>
            {(Object.keys(ACCOUNT_TYPE_LABEL) as FinAccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        {card ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="acc-close" className={lbl}>
                Fecha dia
              </label>
              <input id="acc-close" type="number" min={1} max={31} className={inputCls} value={f.closingDay} onChange={(e) => set("closingDay", e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="acc-due" className={lbl}>
                Vence dia
              </label>
              <input id="acc-due" type="number" min={1} max={31} className={inputCls} value={f.dueDay} onChange={(e) => set("dueDay", e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="acc-limit" className={lbl}>
                Limite
              </label>
              <input id="acc-limit" inputMode="decimal" className={inputCls} value={f.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} placeholder="opcional" />
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <label htmlFor="acc-bal" className={lbl}>
              Saldo atual (R$)
            </label>
            <input id="acc-bal" inputMode="decimal" className={inputCls} value={f.initialBalance} onChange={(e) => set("initialBalance", e.target.value)} />
            <small className="text-[13px] text-fg-3">Quanto tem hoje na conta. Os lançamentos pagos a partir daqui atualizam o saldo.</small>
          </div>
        )}
        <div className="grid gap-1.5">
          <span className={lbl}>Cor</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={f.color === c} onClick={() => set("color", c)} className={cn("size-9 rounded-full border-2", f.color === c ? "border-fg" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <Button type="submit" block disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Salvar
        </Button>
        {editing && (
          <Button
            variant="quiet"
            block
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await archiveAccount(initial.id!);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Arquivada");
                onClose();
              })
            }
          >
            <Archive /> Arquivar
          </Button>
        )}
      </form>
    </Sheet>
  );
}

function PaySheet({ invoice, card, onClose }: { invoice: FinInvoiceDTO; card: FinAccountDTO; onClose: () => void }) {
  const { today } = useApp();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [date, setDate] = useState(today);
  return (
    <Sheet open onClose={onClose} title={`Pagar fatura ${card.name}`} description={`${monthName(invoice.month)} · ${brl(invoice.total)}`}>
      <div className="grid gap-3.5">
        <div className="grid gap-1.5">
          <label htmlFor="pay-from" className={lbl}>
            Pagar com
          </label>
          <AccountSelect id="pay-from" value={from} onChange={setFrom} placeholder="Escolha a conta" excludeCards />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="pay-date" className={lbl}>
            Data do pagamento
          </label>
          <input id="pay-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button
          block
          disabled={pending || !from}
          onClick={() =>
            start(async () => {
              const r = await payInvoice(card.id, invoice.month, from, date);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Fatura paga");
              onClose();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Confirmar pagamento de {brl(invoice.total)}
        </Button>
      </div>
    </Sheet>
  );
}
