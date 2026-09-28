"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Calendar, Check, Flame, Inbox, Mic, Tag, User } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { parseNL, type NLResult } from "@/lib/nl-parse";
import { formatBR, formatShort } from "@/lib/dates";
import { KIND_ICON, KIND_LABEL } from "@/lib/labels";
import { createAction } from "@/app/actions/actions";
import { captureToInbox } from "@/app/actions/inbox";
import { cn } from "@/lib/utils";

const QUEUE_KEY = "hrm-captura-offline";

type Queued = { text: string; mode: "action" | "inbox"; at: number };

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* armazenamento indisponível */
  }
}

/** Envia capturas feitas sem sinal quando a conexão volta (sempre para a caixa de entrada). */
export function useOfflineQueueFlush() {
  useEffect(() => {
    const flush = async () => {
      const q = readQueue();
      if (!q.length || !navigator.onLine) return;
      const rest: Queued[] = [];
      for (const item of q) {
        const r = await captureToInbox(item.text).catch(() => ({ ok: false as const, error: "" }));
        if (!r.ok) rest.push(item);
      }
      writeQueue(rest);
      const sent = q.length - rest.length;
      if (sent) toast.success(`${sent} ${sent === 1 ? "captura feita sem sinal foi enviada" : "capturas feitas sem sinal foram enviadas"} para a Caixa de Entrada`);
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
}

export function ParsedChips({ r }: { r: NLResult }) {
  const { sectorById, personById } = useApp();
  const sec = sectorById(r.sectorId);
  const person = personById(r.assigneeId);
  const prio = r.urgent && r.important ? "Urgente e importante" : r.urgent ? "Urgente" : r.important ? "Importante" : null;
  const chip = "inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[14px] font-semibold [&_svg]:size-[15px]";
  const lab = "font-medium text-fg-3";
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        <span className={cn(chip, "bg-surface-2")}>
          <Icon name={KIND_ICON[r.kind]} />
          <span className={lab}>Tipo</span>
          {KIND_LABEL[r.kind]}
        </span>
        <span className={cn(chip, "bg-surface-2")}>
          <User />
          <span className={lab}>Responsável</span>
          {person ? person.name : "você"}
        </span>
        <span className={cn(chip, r.dueDate ? "bg-surface-2" : "border border-dashed border-line-strong font-medium text-fg-3")}>
          <Calendar />
          <span className={lab}>Prazo</span>
          {r.dueDate ? `${formatShort(r.dueDate)} · ${formatBR(r.dueDate)}` : "sem prazo"}
        </span>
        <span className={cn(chip, sec ? "bg-surface-2" : "border border-dashed border-line-strong font-medium text-fg-3")}>
          {sec ? <Icon name={sec.icon} /> : <Tag />}
          <span className={lab}>Setor</span>
          {sec ? `${sec.shortName || sec.name}${r.sectorInferred ? " (pelo responsável)" : ""}` : "não definido"}
        </span>
        {prio && (
          <span className={cn(chip, "bg-surface-2")}>
            <Flame />
            <span className={lab}>Prioridade</span>
            {prio}
          </span>
        )}
        {r.tags.map((t) => (
          <span key={t} className={cn(chip, "bg-surface-2")}>
            <Tag />#{t}
          </span>
        ))}
      </div>
      <p className="px-0.5 text-[15px] text-fg-2">
        Título: <b className="text-fg">{r.title || "—"}</b>
      </p>
    </div>
  );
}

export function CaptureSheet() {
  const { captureOpen, closeCapture, captureSeed, today, people, sectors } = useApp();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const [wasOpen, setWasOpen] = useState(false);
  if (captureOpen !== wasOpen) {
    // ao abrir, começa pelo texto sugerido (ex.: "#qualidade ")
    setWasOpen(captureOpen);
    if (captureOpen) setText(captureSeed);
  }

  const parsed = useMemo(() => parseNL(text, { today, people, sectors }), [text, today, people, sectors]);

  const submit = (mode: "action" | "inbox") => {
    const t = text.trim();
    if (!t) return;
    if (!navigator.onLine) {
      writeQueue([...readQueue(), { text: t, mode, at: Date.now() }]);
      toast("Sem sinal: guardado no aparelho. Envio automático quando a conexão voltar.");
      setText("");
      closeCapture();
      return;
    }
    start(async () => {
      const r =
        mode === "action"
          ? await createAction({
              title: parsed.title || t,
              kind: parsed.kind,
              assigneeId: parsed.assigneeId,
              sectorId: parsed.sectorId,
              dueDate: parsed.dueDate,
              urgent: parsed.urgent,
              important: parsed.important,
              tags: parsed.tags,
              origin: "CAPTURE",
            })
          : await captureToInbox(t);
      if (r.ok) {
        toast.success(mode === "action" ? "Ação criada" : "Guardado na Caixa de Entrada");
        setText("");
        closeCapture();
      } else toast.error(r.error);
    });
  };

  return (
    <Sheet open={captureOpen} onClose={closeCapture} title="Capturar" description="Escreva ou dite. O sistema separa tipo, pessoa, prazo e setor." wide>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit("action");
        }}
      >
        <label htmlFor="capture-text" className="sr-only">
          Texto da captura
        </label>
        <textarea
          id="capture-text"
          data-autofocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit("action");
            }
          }}
          placeholder="ex.: cobrar Marcos orçamento compressor sexta #manutencao"
          enterKeyHint="done"
          className="min-h-14 w-full resize-none rounded-[14px] border-[1.5px] border-ac bg-bg p-3.5 text-[17px] shadow-[0_0_0_4px_var(--ac-soft)] outline-none placeholder:text-fg-3"
        />
        {text.trim() && <ParsedChips r={parsed} />}
        <div className="grid gap-2 md:grid-cols-2">
          <Button type="submit" block disabled={!text.trim() || pending}>
            <Check />
            Criar ação
          </Button>
          <Button variant="secondary" block disabled={!text.trim() || pending} onClick={() => submit("inbox")}>
            <Inbox />
            Guardar na Caixa de Entrada
          </Button>
        </div>
        <p className="flex items-center gap-1.5 px-1 text-[14px] text-fg-3">
          <Mic className="size-4" aria-hidden="true" />
          No celular, toque no microfone do teclado para ditar.
        </p>
      </form>
    </Sheet>
  );
}
