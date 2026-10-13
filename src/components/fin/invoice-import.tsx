"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ClipboardPaste, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { CategorySelect, useFin } from "@/components/fin/fin-ui";
import { importInvoice } from "@/app/actions/finance";
import { formatShort } from "@/lib/dates";
import { addMonth, brl, invoiceMonthOf, monthName, type FinAccountDTO } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

type Line = {
  date: string;
  description: string;
  amount: number;
  credit: boolean;
  installment: string | null;
  categoryId: string | null;
  match: { txId: string; description: string; amount: number } | null;
  on: boolean;
};
type Parsed = { lines: Line[]; total: number | null; source: "ia" | "texto"; pending: { id: string; description: string; amount: number; date: string }[] };

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export function InvoiceImport({ card, onClose, initialFile, initialText }: { card?: FinAccountDTO; onClose: () => void; initialFile?: File; initialText?: string }) {
  const { today } = useApp();
  const { accounts } = useFin();
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD" && !a.archived);
  const [cardId, setCardId] = useState(card?.id ?? cards[0]?.id ?? "");
  const selected = cards.find((c) => c.id === cardId);
  const defaultMonth = selected ? invoiceMonthOf(today, selected.closingDay, selected.dueDay) : addMonth(today.slice(0, 7), 1);
  const [month, setMonth] = useState(defaultMonth);
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [mode, setMode] = useState<"pdf" | "texto">(initialText ? "texto" : "pdf");
  const [text, setText] = useState(initialText ?? "");
  const [reading, setReading] = useState(false);
  const [data, setData] = useState<Parsed | null>(null);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /** PDF colado (Ctrl+V), arrastado ou escolhido. */
  const takeFiles = (files: FileList | File[] | null | undefined) => {
    const pdf = [...(files ?? [])].find(isPdf);
    if (!pdf) return false;
    setFile(pdf);
    setMode("pdf");
    toast.success(`PDF recebido: ${pdf.name}`);
    return true;
  };

  // Ctrl+V com um PDF copiado (ex.: copiado no Explorer/Finder)
  useEffect(() => {
    if (data) return;
    const onPaste = (e: ClipboardEvent) => {
      if (takeFiles(e.clipboardData?.files)) e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /** Botão "Colar PDF": lê a área de transferência (Chrome/Edge). */
  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t === "application/pdf");
        if (type) {
          const blob = await it.getType(type);
          setFile(new File([blob], "fatura-colada.pdf", { type }));
          setMode("pdf");
          return void toast.success("PDF colado");
        }
      }
      toast("Não há PDF copiado. Copie o arquivo e use Ctrl+V nesta janela, ou arraste o PDF para cá.");
    } catch {
      toast("Use Ctrl+V nesta janela com o PDF copiado, ou arraste o arquivo para cá.");
    }
  };

  const read = async () => {
    if (!cardId || (mode === "pdf" ? !file : !text.trim())) return;
    setReading(true);
    try {
      const fd = new FormData();
      if (mode === "pdf") fd.append("file", file!);
      else fd.append("text", text);
      fd.append("cardId", cardId);
      fd.append("month", month);
      const res = await fetch("/api/financas/fatura", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Não foi possível ler o PDF.");
      const lines: Line[] = json.lines.map((l: Omit<Line, "on">) => ({ ...l, on: true }));
      if (!lines.length) throw new Error(mode === "pdf" ? "Não encontrei compras neste PDF. Confira se é a fatura do cartão." : "Não encontrei compras no texto. Copie a lista de lançamentos com datas e valores.");
      setData({ ...json, lines });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o PDF.");
    } finally {
      setReading(false);
    }
  };

  const upd = (i: number, p: Partial<Line>) => setData((d) => d && { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const chosen = data?.lines.filter((l) => l.on) ?? [];
  const total = chosen.reduce((t, l) => t + (l.credit ? -l.amount : l.amount), 0);
  const matched = chosen.filter((l) => l.match).length;

  const save = () =>
    start(async () => {
      const r = await importInvoice(
        cardId,
        month,
        chosen.map((l) => ({ date: l.date, description: l.description, amount: l.amount, credit: l.credit, categoryId: l.categoryId, matchTxId: l.match?.txId ?? null })),
      );
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
      const { created, matched: m, skipped } = r.data;
      toast.success(`Fatura lançada: ${created} compras${m ? `, ${m} fixos abatidos` : ""}${skipped ? `, ${skipped} já existiam` : ""}`);
      onClose();
    });

  if (!cards.length)
    return (
      <Sheet open onClose={onClose} title="Importar fatura">
        <p className="text-[15px] text-fg-2">Cadastre primeiro o cartão em “Contas e cartões → Novo cartão”.</p>
      </Sheet>
    );

  return (
    <Sheet open onClose={onClose} title="Importar fatura" description="Envie o PDF ou cole o texto da fatura: o sistema lê as compras e abate os fixos que já estão lançados." wide>
      {!data ? (
        <div className="grid gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="inv-card" className="text-[15px] font-semibold md:text-[13px]">
                Cartão
              </label>
              <select
                id="inv-card"
                value={cardId}
                onChange={(e) => {
                  setCardId(e.target.value);
                  const c = cards.find((x) => x.id === e.target.value);
                  if (c) setMonth(invoiceMonthOf(today, c.closingDay, c.dueDay));
                }}
                className="h-12 rounded-[12px] border border-line-strong bg-bg px-3 text-[16px] md:h-10 md:text-[14px]"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="inv-month" className="text-[15px] font-semibold md:text-[13px]">
                Fatura com vencimento em
              </label>
              <input id="inv-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-12 rounded-[12px] border border-line-strong bg-bg px-3 text-[16px] md:h-10 md:text-[14px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="Forma de importar">
            {(
              [
                ["pdf", "Arquivo PDF"],
                ["texto", "Colar texto"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={mode === k}
                onClick={() => setMode(k)}
                className={cn("h-11 rounded-[9px] text-[14px] font-semibold text-fg-2 md:h-9", mode === k && "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--line)]")}
              >
                {k === "pdf" ? <FileText className="mr-1.5 inline size-4" /> : <ClipboardPaste className="mr-1.5 inline size-4" />}
                {l}
              </button>
            ))}
          </div>
          {mode === "texto" ? (
            <div className="grid gap-1.5">
              <label htmlFor="inv-text" className="sr-only">
                Texto da fatura
              </label>
              <textarea
                id="inv-text"
                rows={9}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Cole aqui os lançamentos copiados do app ou do site do banco, ex.:\n12/10 NETFLIX.COM 59,90\n14/10 POSTO SHELL 250,00\n15/10 MAGAZINE LUIZA 02/10 312,50"}
                className="w-full rounded-[12px] border border-line-strong bg-bg p-3.5 font-mono text-[14px] leading-relaxed outline-none focus:border-ac"
              />
              <span className="text-[13px] text-fg-3">No app do banco: abra a fatura, selecione os lançamentos, copie e cole aqui. Também serve texto de e-mail ou WhatsApp.</span>
            </div>
          ) : (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!takeFiles(e.dataTransfer.files)) toast.error("Solte um arquivo PDF.");
              }}
              className={cn(
                "grid place-items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed px-4 py-7 text-center",
                dragging ? "border-ac bg-ac-soft" : file ? "border-ac bg-ac-soft" : "border-line-strong hover:bg-surface-2",
              )}
            >
              {file ? <FileText className="size-7 text-ac-text" /> : <Upload className="size-7 text-fg-3" />}
              <b className="text-[16px] md:text-[14px]">{file ? file.name : dragging ? "Solte o PDF aqui" : "Escolher, arrastar ou colar o PDF"}</b>
              <span className="text-[13px] text-fg-3">No computador: copie o arquivo e aperte Ctrl+V aqui. No Android: no app do banco, Compartilhar → Gestão PS.</span>
            </button>
            <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => void pasteFromClipboard()}>
              <ClipboardPaste /> Colar PDF copiado
            </Button>
          </div>
          )}
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => takeFiles(e.target.files)} />
          <Button block disabled={(mode === "pdf" ? !file : !text.trim()) || reading} onClick={read}>
            {reading ? <Loader2 className="animate-spin" /> : <Sparkles />} {reading ? "Lendo a fatura…" : "Ler a fatura"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-[14px]">
            <span>
              {selected?.name} · {monthName(month)} · {data.lines.length} linhas
            </span>
            <span className="font-semibold tabular-nums">
              Selecionado {brl(total)}
              {data.total != null && <span className="ml-1 font-normal text-fg-3">(PDF: {brl(data.total)})</span>}
            </span>
          </div>
          {matched > 0 && <p className="text-[14px] text-fg-2">{matched} {matched === 1 ? "gasto fixo foi reconhecido" : "gastos fixos foram reconhecidos"} e será abatido nesta fatura (não duplica).</p>}
          <ul className="grid gap-1.5">
            {data.lines.map((l, i) => (
              <li key={i} className={cn("grid gap-2 rounded-[12px] border border-line p-2.5", !l.on && "opacity-50")}>
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--ac)]" checked={l.on} onChange={(e) => upd(i, { on: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium md:text-[14px]">{l.description}</span>
                    <span className="text-[13px] text-fg-3">{formatShort(l.date)}</span>
                    {l.match && <span className="ml-2 rounded-full bg-green-bg px-2 py-0.5 text-[12px] font-semibold text-green">fixo: {l.match.description} · abatido</span>}
                  </span>
                  <b className={cn("tabular-nums", l.credit && "text-green")}>
                    {l.credit ? "-" : ""}
                    {brl(l.amount)}
                  </b>
                </label>
                {!l.match && l.on && <CategorySelect id={`inv-cat-${i}`} kind={l.credit ? "INCOME" : "EXPENSE"} value={l.categoryId ?? ""} onChange={(v) => upd(i, { categoryId: v || null })} />}
              </li>
            ))}
          </ul>
          {data.pending.length > 0 && (
            <p className="rounded-[10px] bg-amber-bg px-3 py-2 text-[13px] text-fg-2">
              Fixos no cartão não encontrados nesta fatura: {data.pending.map((p) => `${p.description} (${brl(p.amount)})`).join(", ")}. Eles continuam aguardando a próxima fatura ou outro cartão.
            </p>
          )}
          <p className="text-[13px] text-fg-3">Leitura {data.source === "ia" ? "feita pela IA" : mode === "pdf" ? "pelo texto do PDF" : "do texto colado"}. Desmarque o que não for compra (pagamentos, tarifas que você não quer lançar).</p>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" onClick={() => setData(null)}>
              Voltar
            </Button>
            <Button onClick={save} disabled={pending || !chosen.length}>
              {pending && <Loader2 className="animate-spin" />} Lançar {chosen.length} na fatura · {brl(total)}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
