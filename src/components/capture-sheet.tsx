"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Calendar, CalendarDays, Check, Flame, Inbox, ListChecks, Loader2, MapPin, Mic, Sparkles, Square, Tag, User } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { parseNL, type NLEventType, type NLResult } from "@/lib/nl-parse";
import { useSpeech } from "@/lib/use-speech";
import { saveEvent } from "@/app/actions/events";
import { interpretCapture } from "@/app/actions/interpret";
import { REMINDER_CHOICES, reminderLabel } from "@/lib/reminder-options";
import { addDaysISO, formatBR, formatShort, nextMondayISO, weekdayOf } from "@/lib/dates";
import { EVENT_TYPE_ICON, EVENT_TYPE_LABEL, KIND_ICON, KIND_LABEL } from "@/lib/labels";
import { addActionUpdate, createAction } from "@/app/actions/actions";
import { attachFiles } from "@/app/actions/attachments";
import { AttachButtons, PendingFiles } from "@/components/attachments";
import { uploadFiles } from "@/lib/upload-client";
import type { UploadedFile } from "@/lib/upload-rules";
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

function enqueue(text: string) {
  writeQueue([...readQueue(), { text, mode: "inbox", at: Date.now() }]);
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

type Mode = "action" | "event";
type Overrides = Partial<{
  title: string;
  kind: NLResult["kind"];
  assigneeId: string;
  sectorId: string;
  dueDate: string;
  urgent: boolean;
  important: boolean;
  description: string;
  eventType: NLEventType;
  date: string;
  start: string;
  end: string;
  location: string;
  attendees: string;
  reminder: string;
}>;

const inputCls =
  "h-11 w-full min-w-0 rounded-[10px] border border-line-strong bg-bg px-3 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_3px_var(--ac-soft)] md:h-10 md:text-[14px]";
const labelCls = "text-[13px] font-semibold text-fg-2";
const chipCls = (on: boolean) =>
  cn(
    "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[14px] font-semibold md:h-8 md:text-[13px] [&_svg]:size-4",
    on ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-2 hover:border-line-strong",
  );

function addMinutes(t: string, min: number) {
  const [h, m] = t.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + min);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const addHour = (t: string) => addMinutes(t, 60);

/** Hora atual em São Paulo ("14:05"), para entender "daqui a 30 minutos". */
function nowSP() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

/** Uma linha do resumo "Entendi assim". Sem valor: aparece apagada para mostrar o que faltou. */
function Understood({ icon: I, children, missing }: { icon: typeof Calendar; children: React.ReactNode; missing?: boolean }) {
  return (
    <li className={cn("flex items-start gap-2", missing && "text-fg-3")}>
      <I className="mt-[3px] size-4 shrink-0 text-fg-3" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function CaptureSheet() {
  const { captureOpen, closeCapture, captureSeed, captureVoice, today, people, sectors, personById, sectorById, reminderMinutes, ai: aiEnabled } = useApp();
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [ov, setOv] = useState<Overrides>({});
  const [modeChoice, setModeChoice] = useState<Mode | null>(null);
  const [showDesc, setShowDesc] = useState(false);
  const [ai, setAi] = useState<{ text: string; r: NLResult } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [heard, setHeard] = useState(false);
  // hora atual, atualizada a cada texto novo (para "daqui a 30 minutos")
  const [now, setNow] = useState("09:00");
  const textRef = useRef("");
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const refine = useCallback(
    async (t: string) => {
      if (!aiEnabled || t.trim().length < 3) return;
      setThinking(true);
      try {
        const r = await interpretCapture(t);
        if (r.ok && r.data) setAi({ text: t, r: r.data });
      } finally {
        setThinking(false);
      }
    },
    [aiEnabled],
  );

  const speech = useSpeech(
    (chunk) => {
      setNow(nowSP());
      setText((t) => (t.trim() ? `${t.trim()} ${chunk}` : chunk));
    },
    (got) => {
      if (!got) return;
      setHeard(true);
      // o texto final chega no mesmo ciclo; espera o estado assentar
      setTimeout(() => void refine(textRef.current), 0);
    },
  );

  const [wasOpen, setWasOpen] = useState(false);
  if (captureOpen !== wasOpen) {
    // ao abrir, começa limpo com o texto sugerido (ex.: "#qualidade ")
    setWasOpen(captureOpen);
    if (captureOpen) {
      setText(captureSeed);
      setFiles([]);
      setOv({});
      setModeChoice(null);
      setShowDesc(false);
      setAi(null);
      setHeard(false);
    } else if (speech.listening) speech.stop();
  }

  // Aberto pelo atalho "Falar": já começa a ouvir
  const { start: startListening } = speech;
  useEffect(() => {
    if (captureOpen && captureVoice) startListening();
  }, [captureOpen, captureVoice, startListening]);


  const local = useMemo(() => parseNL(text, { today, people, sectors, now }), [text, today, people, sectors, now]);
  // A IA (quando disponível) refina o que o interpretador local entendeu; se o texto mudar, volta ao local.
  const parsed: NLResult = ai && ai.text === text ? { ...ai.r, tags: local.tags, durationMin: local.durationMin } : local;
  const mode: Mode = modeChoice ?? (parsed.isEvent ? "event" : "action");
  const set = <K extends keyof Overrides>(k: K, v: Overrides[K]) => setOv((o) => ({ ...o, [k]: v }));

  // Valores efetivos: o que o usuário escolheu, senão o que foi entendido do texto.
  const startT = ov.start ?? parsed.startTime ?? "09:00";
  const v = {
    title: ov.title ?? parsed.title,
    kind: ov.kind ?? parsed.kind,
    assigneeId: ov.assigneeId ?? parsed.assigneeId ?? "",
    sectorId: ov.sectorId ?? parsed.sectorId ?? "",
    dueDate: ov.dueDate ?? parsed.dueDate ?? "",
    urgent: ov.urgent ?? parsed.urgent,
    important: ov.important ?? parsed.important,
    description: ov.description ?? "",
    eventType: ov.eventType ?? parsed.eventType,
    date: ov.date ?? parsed.dueDate ?? today,
    start: startT,
    end: ov.end ?? (ov.start ? addMinutes(startT, parsed.durationMin ?? 60) : (parsed.endTime ?? addMinutes(startT, parsed.durationMin ?? 60))),
    location: ov.location ?? parsed.location ?? "",
    attendees: ov.attendees ?? (parsed.assigneeId ? (personById(parsed.assigneeId)?.name.split(" ")[0] ?? "") : ""),
    reminder: ov.reminder ?? (parsed.reminderMinutes == null ? "" : String(parsed.reminderMinutes)),
  };
  const lead = v.reminder === "" ? reminderMinutes : Number(v.reminder);

  const hasContent = !!v.title.trim() || !!text.trim() || files.length > 0;
  const tomorrow = addDaysISO(today, 1);
  const friday = (() => {
    const add = (5 - weekdayOf(today) + 7) % 7 || 7;
    return addDaysISO(today, add);
  })();
  const monday = nextMondayISO(today);

  const upload = async () => {
    if (!files.length) return [] as UploadedFile[];
    try {
      const up = await uploadFiles(files, (i, total, pct) => setProgress(total > 1 ? `Enviando ${i} de ${total} · ${pct}%` : `Enviando · ${pct}%`));
      return up;
    } finally {
      setProgress(null);
    }
  };

  const done = () => {
    setText("");
    setFiles([]);
    setOv({});
    setAi(null);
    closeCapture();
  };

  const submit = (target: Mode | "inbox") => {
    if (speech.listening) speech.stop();
    const t = text.trim();
    if (!hasContent) return;
    if (!navigator.onLine) {
      if (files.length) return void toast.error("Sem sinal: fotos e documentos precisam de conexão. O texto pode ser guardado sem os anexos.");
      enqueue(t || v.title);
      toast("Sem sinal: guardado no aparelho. Vai para a Caixa de Entrada quando a conexão voltar.");
      done();
      return;
    }
    start(async () => {
      let uploaded: UploadedFile[] = [];
      try {
        uploaded = await upload();
      } catch (e) {
        return void toast.error(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
      }
      const fallback = files.length ? `${files.length === 1 ? "Anexo capturado" : "Anexos capturados"} em ${formatBR(today)}` : "";

      if (target === "inbox") {
        const r = await captureToInbox(t || v.title || fallback);
        if (!r.ok) return void toast.error(r.error);
        if (uploaded.length && r.data) {
          const u = await attachFiles({ kind: "inbox", id: r.data.id }, uploaded);
          if (!u.ok) toast.error(u.error);
        }
        toast.success("Guardado na Caixa de Entrada");
        return done();
      }

      if (target === "event") {
        const r = await saveEvent({
          title: v.title || t || fallback || "Compromisso",
          type: v.eventType,
          date: v.date,
          start: v.start,
          end: v.end > v.start ? v.end : addHour(v.start),
          allDay: false,
          location: v.location,
          sectorId: v.sectorId || null,
          attendees: v.attendees,
          reminderMinutes: v.reminder === "" ? null : Number(v.reminder),
          recurrence: { freq: "NONE" },
        });
        if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro ao agendar." : r.error);
        if (uploaded.length) {
          const u = await attachFiles({ kind: "event", id: r.data.id }, uploaded);
          if (!u.ok) toast.error(u.error);
        }
        const id = r.data.id;
        toast.success(`Agendado: ${formatShort(v.date)} às ${v.start}${lead >= 0 ? ` · aviso ${reminderLabel(lead).toLowerCase()}` : ""}`, {
          action: { label: "Abrir", onClick: () => router.push(`/agenda/evento/${id}`) },
        });
        return done();
      }

      const r = await createAction({
        title: v.title || t || fallback,
        description: v.description || null,
        kind: v.kind,
        assigneeId: v.assigneeId || null,
        sectorId: v.sectorId || null,
        dueDate: v.dueDate || null,
        urgent: v.urgent,
        important: v.important,
        tags: parsed.tags,
        origin: "CAPTURE",
      });
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro ao criar." : r.error);
      if (uploaded.length) {
        const u = await addActionUpdate(r.data.id, { kind: "EVIDENCE", text: null, attachments: uploaded });
        if (!u.ok) toast.error(u.error);
      }
      const id = r.data.id;
      toast.success("Ação criada", { action: { label: "Abrir", onClick: () => router.push(`/acoes/${id}`) } });
      done();
    });
  };

  const activeSectors = sectors.filter((s) => s.active);
  const sec = sectorById(v.sectorId);
  const person = personById(v.assigneeId);
  const prio = v.urgent && v.important ? "Urgente e importante" : v.urgent ? "Urgente" : v.important ? "Importante" : null;

  return (
    <Sheet open={captureOpen} onClose={closeCapture} title="Capturar" description="Fale ou escreva. O sistema entende e preenche; confira e salve." wide>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(mode);
        }}
      >
        {/* Texto + voz */}
        <div className="grid gap-2">
          <label htmlFor="capture-text" className="sr-only">
            Texto da captura
          </label>
          <div className="relative">
            <textarea
              id="capture-text"
              data-autofocus={captureVoice ? undefined : true}
              rows={2}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setNow(nowSP());
                setHeard(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(mode);
                }
              }}
              placeholder="ex.: reunião da qualidade quinta às 3 da tarde · cobrar Marcos orçamento sexta"
              enterKeyHint="done"
              className="min-h-[72px] w-full resize-none rounded-[14px] border-[1.5px] border-ac bg-bg p-3.5 pr-[64px] text-[17px] shadow-[0_0_0_4px_var(--ac-soft)] outline-none placeholder:text-fg-3"
            />
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? "Parar de ouvir" : "Falar"}
              className={cn(
                "absolute right-2 top-2 grid size-12 place-items-center rounded-full transition-colors",
                speech.listening ? "animate-pulse bg-red-solid text-white" : "bg-ac text-ac-fg hover:bg-ac-hover",
              )}
            >
              {speech.listening ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
            </button>
          </div>
          {speech.listening && (
            <p className="flex items-center gap-2 px-1 text-[15px] font-medium text-red" role="status">
              <span className="size-2 animate-pulse rounded-full bg-red-solid" /> Ouvindo… {speech.interim ? <span className="text-fg-2">“{speech.interim}”</span> : "fale e faça uma pausa no fim"}
            </p>
          )}
          {!speech.listening && speech.error && <p className="px-1 text-[14px] text-amber">{speech.error}</p>}
          {!speech.listening && !speech.error && !text && (
            <p className="flex items-center gap-1.5 px-1 text-[14px] text-fg-3">
              <Mic className="size-4 shrink-0" aria-hidden="true" /> Toque no microfone e fale de uma vez: o quê, quando, com quem. Ex.: “reunião com o Anderson amanhã às duas da tarde, me avise 15 minutos antes”.
            </p>
          )}
        </div>

        {/* Entendi assim */}
        {text.trim() && !speech.listening && (
          <div className="grid gap-2.5 rounded-[14px] bg-ac-soft p-3.5" role="status" aria-live="polite">
            <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.05em] text-ac-text">
              {thinking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {thinking ? "Entendendo melhor…" : "Entendi assim"}
            </p>
            <p className="text-[18px] font-semibold leading-snug md:text-[16px]">
              {mode === "event" ? "Compromisso: " : `${KIND_LABEL[v.kind]}: `}
              {v.title || "—"}
            </p>
            <ul className="grid gap-1 text-[15px] text-fg md:text-[14px]">
              {mode === "event" ? (
                <>
                  <Understood icon={CalendarDays}>
                    <b>{formatShort(v.date)}</b> · {v.start}–{v.end}
                    {!parsed.startTime && !ov.start && <span className="text-fg-3"> (horário não dito)</span>}
                  </Understood>
                  <Understood icon={Tag} missing={!sec}>
                    {sec ? sec.name : "Sem setor"}
                  </Understood>
                  {(person || v.attendees) && <Understood icon={User}>Com {person ? person.name : v.attendees}</Understood>}
                  {v.location && <Understood icon={MapPin}>{v.location}</Understood>}
                  <Understood icon={Bell} missing={lead < 0}>
                    {lead < 0 ? "Sem aviso" : `Aviso ${reminderLabel(lead).toLowerCase()}`}
                    {v.reminder === "" && lead >= 0 && <span className="text-fg-3"> (padrão)</span>}
                  </Understood>
                </>
              ) : (
                <>
                  <Understood icon={Calendar} missing={!v.dueDate}>
                    {v.dueDate ? (
                      <>
                        Prazo <b>{formatShort(v.dueDate)}</b>
                      </>
                    ) : (
                      "Sem prazo"
                    )}
                  </Understood>
                  <Understood icon={User}>{person ? person.name : "Eu mesmo"}</Understood>
                  <Understood icon={Tag} missing={!sec}>
                    {sec ? `${sec.name}${!ov.sectorId && parsed.sectorInferred ? " (pelo responsável)" : ""}` : "Sem setor"}
                  </Understood>
                  {prio && <Understood icon={Flame}>{prio}</Understood>}
                </>
              )}
            </ul>
            {heard && (
              <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
                <Button type="submit" block disabled={pending || thinking}>
                  {pending ? <Loader2 className="animate-spin" /> : <Check />} Está certo, salvar
                </Button>
                <Button variant="secondary" onClick={() => setHeard(false)}>
                  Ajustar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Ação ou compromisso */}
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="O que é">
          {(
            [
              ["action", "Ação / tarefa", ListChecks],
              ["event", "Compromisso", CalendarDays],
            ] as const
          ).map(([k, l, I]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              onClick={() => setModeChoice(k)}
              className={cn("flex h-11 items-center justify-center gap-2 rounded-[9px] text-[15px] font-semibold text-fg-2 md:h-9 md:text-[14px]", mode === k && "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--line)]")}
            >
              <I className="size-[18px]" /> {l}
            </button>
          ))}
        </div>

        {(text.trim() || v.title) && (
          <div className="grid gap-3 rounded-[14px] border border-line p-3">
            <div className="grid gap-1">
              <label htmlFor="cap-title" className={labelCls}>
                Título
              </label>
              <input id="cap-title" className={inputCls} value={v.title} onChange={(e) => set("title", e.target.value)} />
            </div>

            {mode === "action" ? (
              <>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de ação">
                  {(Object.keys(KIND_LABEL) as NLResult["kind"][]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={v.kind === k} className={chipCls(v.kind === k)} onClick={() => set("kind", k)}>
                      <Icon name={KIND_ICON[k]} />
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="grid gap-1">
                    <label htmlFor="cap-person" className={labelCls}>
                      Responsável
                    </label>
                    <select
                      id="cap-person"
                      className={inputCls}
                      value={v.assigneeId}
                      onChange={(e) => {
                        const id = e.target.value;
                        set("assigneeId", id);
                        if (id && v.kind === "DO") set("kind", "DELEGATE");
                      }}
                    >
                      <option value="">Eu mesmo</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="cap-sector" className={labelCls}>
                      Setor
                    </label>
                    <select id="cap-sector" className={inputCls} value={v.sectorId} onChange={(e) => set("sectorId", e.target.value)}>
                      <option value="">Sem setor</option>
                      {activeSectors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.parentId ? `  ${s.name}` : s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-1">
                  <span className={labelCls}>Prazo</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ["Hoje", today],
                        ["Amanhã", tomorrow],
                        ["Sexta", friday],
                        ["Próx. segunda", monday],
                        ["Sem prazo", ""],
                      ] as const
                    ).map(([l, d]) => (
                      <button key={l} type="button" className={chipCls(v.dueDate === d)} onClick={() => set("dueDate", d)}>
                        {l}
                      </button>
                    ))}
                    <label htmlFor="cap-due" className="sr-only">
                      Data do prazo
                    </label>
                    <input id="cap-due" type="date" className={cn(inputCls, "h-10 w-auto md:h-8")} value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(labelCls, "mr-1")}>Prioridade</span>
                  <button type="button" aria-pressed={v.urgent} className={chipCls(v.urgent)} onClick={() => set("urgent", !v.urgent)}>
                    <Flame /> Urgente
                  </button>
                  <button type="button" aria-pressed={v.important} className={chipCls(v.important)} onClick={() => set("important", !v.important)}>
                    Importante
                  </button>
                </div>
                {showDesc ? (
                  <div className="grid gap-1">
                    <label htmlFor="cap-desc" className={labelCls}>
                      Descrição
                    </label>
                    <textarea id="cap-desc" rows={3} className={cn(inputCls, "h-auto py-2.5")} value={v.description} onChange={(e) => set("description", e.target.value)} />
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowDesc(true)} className="w-max text-[14px] font-semibold text-ac-text">
                    + Adicionar descrição
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de compromisso">
                  {(Object.keys(EVENT_TYPE_LABEL) as NLEventType[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={v.eventType === k} className={chipCls(v.eventType === k)} onClick={() => set("eventType", k)}>
                      <Icon name={EVENT_TYPE_ICON[k]} />
                      {EVENT_TYPE_LABEL[k]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.4fr_1fr_1fr]">
                  <div className="col-span-2 grid gap-1 md:col-span-1">
                    <label htmlFor="cap-date" className={labelCls}>
                      Data
                    </label>
                    <input id="cap-date" type="date" className={inputCls} value={v.date} onChange={(e) => set("date", e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="cap-start" className={labelCls}>
                      Início
                    </label>
                    <input
                      id="cap-start"
                      type="time"
                      className={inputCls}
                      value={v.start}
                      onChange={(e) => {
                        const s = e.target.value;
                        setOv((o) => ({ ...o, start: s, end: (o.end ?? v.end) <= s ? addHour(s) : (o.end ?? v.end) }));
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="cap-end" className={labelCls}>
                      Fim
                    </label>
                    <input id="cap-end" type="time" className={inputCls} value={v.end} onChange={(e) => set("end", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="grid gap-1">
                    <label htmlFor="cap-esector" className={labelCls}>
                      Setor
                    </label>
                    <select id="cap-esector" className={inputCls} value={v.sectorId} onChange={(e) => set("sectorId", e.target.value)}>
                      <option value="">Nenhum</option>
                      {activeSectors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.parentId ? `  ${s.name}` : s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="cap-rem" className={labelCls}>
                      Aviso no celular
                    </label>
                    <select id="cap-rem" className={inputCls} value={v.reminder} onChange={(e) => set("reminder", e.target.value)}>
                      <option value="">Padrão ({reminderLabel(reminderMinutes).toLowerCase()})</option>
                      {REMINDER_CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="grid gap-1">
                    <label htmlFor="cap-loc" className={labelCls}>
                      Local
                    </label>
                    <input id="cap-loc" className={inputCls} value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="Sala, cliente, Teams…" />
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="cap-att" className={labelCls}>
                      Participantes
                    </label>
                    <input id="cap-att" className={inputCls} value={v.attendees} onChange={(e) => set("attendees", e.target.value)} placeholder="ex.: Anderson, Ricardo" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <AttachButtons disabled={pending} onFiles={(f) => setFiles((cur) => [...cur, ...f].slice(0, 10))} />
        <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        {progress && (
          <p className="flex items-center gap-2 px-1 text-[14px] font-medium text-ac-text" role="status">
            <Loader2 className="size-4 animate-spin" /> {progress}
          </p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          <Button type="submit" block disabled={!hasContent || pending}>
            {pending ? <Loader2 className="animate-spin" /> : mode === "event" ? <CalendarDays /> : <Check />}
            {mode === "event" ? "Agendar compromisso" : "Criar ação"}
          </Button>
          <Button variant="secondary" block disabled={!hasContent || pending} onClick={() => submit("inbox")}>
            <Inbox />
            Guardar na Caixa de Entrada
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
