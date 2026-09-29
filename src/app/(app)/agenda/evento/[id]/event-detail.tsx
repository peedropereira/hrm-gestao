"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, CalendarPlus, FileText, ListChecks, Loader2, MapPin, Pencil, Plus, Repeat, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { reminderLabel } from "@/lib/reminder-options";
import { useApp } from "@/components/app-provider";
import { MeetingRecorder, type RecorderProps } from "./meeting-recorder";
import { Button } from "@/components/button";
import { Card, DueBadge, PanelHead, PersonChip, SectorChip } from "@/components/ds";
import { Icon } from "@/components/icon";
import { Sheet, SheetOption } from "@/components/sheet";
import { CheckButton } from "@/components/action-bits";
import { ParsedChips } from "@/components/capture-sheet";
import { AttachButtons, AttachmentUploader } from "@/components/attachments";
import { EventForm, type EventOptions } from "@/components/event-form";
import { createActionsFromMinutes, deleteEvent, ensureOccurrence, saveMinutes, undoDeleteEvent } from "@/app/actions/events";
import { attachFiles } from "@/app/actions/attachments";
import { uploadFiles } from "@/lib/upload-client";
import { parseNL, type NLResult } from "@/lib/nl-parse";
import { formatLong } from "@/lib/dates";
import { EVENT_TYPE_ICON, EVENT_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionDTO, AttachmentDTO, OccurrenceDTO } from "@/lib/types";

export type EventDetailData = {
  eventId: string;
  seriesId: string | null;
  virtual: boolean;
  date: string;
  start: string;
  end: string;
  allDay: boolean;
  title: string;
  type: OccurrenceDTO["type"];
  location: string | null;
  sectorId: string | null;
  demand: { id: string; title: string; sectorSlug: string } | null;
  linkedAction: { id: string; title: string } | null;
  attendees: string | null;
  reminderMinutes: number | null;
  minutes: string | null;
  rrule: string | null;
  ruleText: string;
  attachments: AttachmentDTO[];
  actions: ActionDTO[];
  recording: Pick<RecorderProps, "ai" | "parts" | "transcript">;
};

/** Linhas da ata que viram ação: começam com "-", "*", "•", "->", "[ ]" ou "Ação:". */
const ACTION_LINE = /^\s*(?:[-*•]|->|→|\[\s?\]|a[çc][ãa]o:)\s*(.+)$/i;

export function EventDetail({ data: d, options }: { data: EventDetailData; options: EventOptions }) {
  const { today, people, sectors, personById, sectorById, reminderMinutes } = useApp();
  const lead = d.reminderMinutes ?? reminderMinutes;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [minutes, setMinutes] = useState(d.minutes ?? "");
  const [attendees, setAttendees] = useState(d.attendees ?? "");
  const [dirty, setDirty] = useState(false);
  const [editScope, setEditScope] = useState<null | "ask" | "single" | "series">(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<null | { line: string; r: NLResult; on: boolean }[]>(null);
  const [quick, setQuick] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const isSeriesItem = !!d.seriesId;
  const ref = { id: d.eventId, date: d.virtual ? d.date : null };
  const ctx = { today, people, sectors };
  const candidates = useMemo(
    () =>
      minutes
        .split("\n")
        .map((l) => l.match(ACTION_LINE)?.[1]?.trim())
        .filter((l): l is string => !!l && l.length > 2),
    [minutes],
  );

  /** Depois de gravar algo numa ocorrência de série, a página passa a ser a do registro próprio. */
  const afterSave = (realId: string) => {
    if (realId !== d.eventId) router.replace(`/agenda/evento/${realId}`);
    else router.refresh();
  };

  const save = () =>
    start(async () => {
      const r = await saveMinutes(ref.id, ref.date, minutes, attendees);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro ao salvar." : r.error);
      setDirty(false);
      toast.success("Ata salva");
      afterSave(r.data.id);
    });

  const createFrom = (items: { title: string; r: NLResult }[], markLines?: string[]) =>
    start(async () => {
      if (dirty || markLines?.length) {
        // marca as linhas convertidas com ✓ para não gerar de novo
        const next = markLines?.length
          ? minutes
              .split("\n")
              .map((l) => {
                const m = l.match(ACTION_LINE)?.[1]?.trim();
                return m && markLines.includes(m) ? l.replace(ACTION_LINE, `✓ ${m}`) : l;
              })
              .join("\n")
          : minutes;
        setMinutes(next);
        const s = await saveMinutes(ref.id, ref.date, next, attendees);
        if (!s.ok) return void toast.error(s.error);
        setDirty(false);
      }
      const r = await createActionsFromMinutes(
        ref.id,
        ref.date,
        items.map(({ title, r }) => ({
          title: r.title || title,
          kind: r.kind,
          assigneeId: r.assigneeId,
          sectorId: r.sectorId,
          dueDate: r.dueDate,
          urgent: r.urgent,
          important: r.important,
        })),
      );
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
      toast.success(r.data.count === 1 ? "Ação criada" : `${r.data.count} ações criadas`);
      setPreview(null);
      setQuick("");
      afterSave(r.data.id);
    });

  const sendFiles = (files: File[]) =>
    start(async () => {
      try {
        const e = await ensureOccurrence(ref.id, ref.date);
        if (!e.ok || !e.data) return void toast.error(e.ok ? "Erro." : e.error);
        const up = await uploadFiles(files, (i, total, pct) => setProgress(total > 1 ? `Enviando ${i} de ${total} · ${pct}%` : `Enviando · ${pct}%`));
        const r = await attachFiles({ kind: "event", id: e.data.id }, up);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Anexado");
        afterSave(e.data.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível enviar.");
      } finally {
        setProgress(null);
      }
    });

  const remove = (scope: "single" | "following" | "all") =>
    start(async () => {
      const r = await deleteEvent(d.eventId, scope, d.date);
      setDeleting(false);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
      const undo = r.data.undo;
      toast.success(scope === "single" ? "Compromisso cancelado nesta data" : scope === "following" ? "Série encerrada a partir desta data" : "Compromisso excluído", {
        action: { label: "Desfazer", onClick: () => void undoDeleteEvent(undo).then(() => router.refresh()) },
      });
      router.push(`/agenda?v=semana&d=${d.date}`);
    });

  const sector = sectorById(d.sectorId);

  return (
    <div className="grid gap-5 px-4 pb-8 md:px-0">
      {/* Cabeçalho */}
      <header className="grid gap-3">
        <span className="inline-flex w-max items-center gap-1.5 rounded-[8px] bg-ac-soft px-2 py-1 text-[14px] font-semibold text-ac-text md:text-[13px] [&_svg]:size-4">
          <Icon name={EVENT_TYPE_ICON[d.type]} />
          {EVENT_TYPE_LABEL[d.type]}
        </span>
        <h1 className="text-balance text-[26px] font-bold leading-tight tracking-[-0.02em] md:text-[24px]">{d.title}</h1>
        <ul className="grid gap-2 text-[16px] text-fg-2 md:text-[14px]">
          <li className="flex items-center gap-2.5">
            <CalendarDays className="size-[18px] shrink-0 text-fg-3" />
            <span>
              {formatLong(d.date)} · <b className="font-mono font-semibold text-fg">{d.allDay ? "dia todo" : `${d.start}–${d.end}`}</b>
            </span>
          </li>
          {d.ruleText && (
            <li className="flex items-center gap-2.5">
              <Repeat className="size-[18px] shrink-0 text-fg-3" />
              {d.ruleText}
            </li>
          )}
          {!d.allDay && (
            <li className="flex items-center gap-2.5">
              <Bell className="size-[18px] shrink-0 text-fg-3" />
              {lead < 0 ? "Sem aviso no celular" : `Aviso ${reminderLabel(lead).toLowerCase()}`}
            </li>
          )}
          {d.location && (
            <li className="flex items-center gap-2.5">
              <MapPin className="size-[18px] shrink-0 text-fg-3" />
              {d.location}
            </li>
          )}
          {sector && (
            <li className="flex items-center gap-2.5">
              <Link href={`/setores/${sector.slug}`}>
                <SectorChip sector={sector} className="text-[16px] md:text-[14px]" />
              </Link>
            </li>
          )}
          {d.demand && (
            <li className="flex items-center gap-2.5">
              <FileText className="size-[18px] shrink-0 text-fg-3" />
              <Link href={`/setores/${d.demand.sectorSlug}?aba=demandas`} className="text-ac-text underline-offset-2 hover:underline">
                Demanda: {d.demand.title}
              </Link>
            </li>
          )}
          {d.linkedAction && (
            <li className="flex items-center gap-2.5">
              <ListChecks className="size-[18px] shrink-0 text-fg-3" />
              <Link href={`/acoes/${d.linkedAction.id}`} className="text-ac-text underline-offset-2 hover:underline">
                Ação: {d.linkedAction.title}
              </Link>
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => setEditScope(isSeriesItem ? "ask" : "single")}>
            <Pencil /> Editar
          </Button>
          {!d.allDay && (
            <a
              href={`/api/agenda/ics/${d.seriesId && d.virtual ? d.seriesId : d.eventId}?d=${d.date}`}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] font-semibold hover:bg-surface-2 md:h-9 md:text-[14px] [&_svg]:size-[18px]"
            >
              <CalendarPlus /> Alarme no celular
            </a>
          )}
          <Button variant="quiet" size="sm" className="h-11 md:h-9" onClick={() => setDeleting(true)}>
            <Trash2 /> Excluir
          </Button>
        </div>
      </header>

      {/* Gravação */}
      <MeetingRecorder
        eventId={d.eventId}
        virtual={d.virtual}
        date={d.date}
        title={d.title}
        {...d.recording}
        onMinutes={(text) => {
          setMinutes(text);
          setDirty(false);
        }}
      />

      {/* Ata */}
      <Card>
        <PanelHead title="Ata">
          {dirty && <span className="text-[13px] font-medium text-amber">não salva</span>}
        </PanelHead>
        <div className="grid gap-3 p-4">
          <div className="grid gap-1.5">
            <label htmlFor="att" className="flex items-center gap-1.5 text-[15px] font-semibold md:text-[13px]">
              <Users className="size-4 text-fg-3" /> Participantes
            </label>
            <input
              id="att"
              value={attendees}
              onChange={(e) => {
                setAttendees(e.target.value);
                setDirty(true);
              }}
              placeholder="ex.: Anderson, Ricardo, Fernanda"
              className="h-12 w-full rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac md:h-10 md:text-[14px]"
            />
          </div>
          <label htmlFor="minutes" className="sr-only">
            Texto da ata
          </label>
          <textarea
            id="minutes"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              setDirty(true);
            }}
            rows={8}
            placeholder={"Assuntos, decisões e combinados.\n\nPara virar ação, comece a linha com “-”:\n- Anderson aprovar hora extra sábado #producao\n- cobrar Juliana flanges ANSI sexta"}
            className="min-h-[180px] w-full rounded-[12px] border border-line-strong bg-bg p-3.5 text-[16px] leading-relaxed outline-none focus:border-ac md:text-[14px]"
          />
          <p className="text-[14px] text-fg-3 md:text-[13px]">
            Linhas que começam com <b className="font-mono text-fg-2">-</b> viram ações com responsável, prazo e setor lidos do texto. Depois de geradas, recebem <b className="text-fg-2">✓</b>.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <Button variant="secondary" disabled={pending || !dirty} onClick={save}>
              {pending && <Loader2 className="animate-spin" />} Salvar ata
            </Button>
            <Button
              disabled={pending || !candidates.length}
              onClick={() => setPreview(candidates.map((line) => ({ line, r: parseNL(line, ctx), on: true })))}
            >
              <Sparkles /> Gerar ações da ata{candidates.length ? ` (${candidates.length})` : ""}
            </Button>
          </div>
        </div>
      </Card>

      {/* Ações */}
      <Card>
        <PanelHead title="Ações desta reunião" count={d.actions.length} />
        {d.actions.length > 0 && (
          <ul>
            {d.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-1 border-t border-line py-1.5 pl-1 pr-3.5 first:border-t-0 md:items-center">
                <CheckButton a={a} />
                <Link href={`/acoes/${a.id}`} className="min-w-0 flex-1 py-2 md:flex md:items-center md:gap-3">
                  <span className={cn("block text-[16px] font-medium leading-snug md:flex-1 md:text-[14px]", a.status === "DONE" && "text-fg-3 line-through")}>{a.title}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 md:mt-0">
                    <DueBadge a={a} today={today} />
                    <PersonChip person={personById(a.assigneeId)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2 border-t border-line p-3 first:border-t-0"
          onSubmit={(e) => {
            e.preventDefault();
            if (quick.trim()) createFrom([{ title: quick.trim(), r: parseNL(quick, ctx) }]);
          }}
        >
          <label htmlFor="quick-action" className="sr-only">
            Nova ação da reunião
          </label>
          <input
            id="quick-action"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Nova ação: ex.: Ricardo revisar cronograma quinta"
            className="h-12 min-w-0 flex-1 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac md:h-10 md:text-[14px]"
          />
          <Button type="submit" size="sm" className="h-12 md:h-10" disabled={pending || !quick.trim()} aria-label="Criar ação">
            <Plus />
          </Button>
        </form>
      </Card>

      {/* Fotos e documentos */}
      <Card>
        <PanelHead title="Fotos e documentos" count={d.attachments.length} />
        <div className="p-4">
          {d.virtual ? (
            <div className="grid gap-2">
              <AttachButtons onFiles={sendFiles} disabled={pending} />
              {progress && (
                <p className="flex items-center gap-2 text-[14px] font-medium text-ac-text" role="status">
                  <Loader2 className="size-4 animate-spin" /> {progress}
                </p>
              )}
              <p className="text-[14px] text-fg-3">Foto do quadro, lista de presença, apresentação…</p>
            </div>
          ) : (
            <AttachmentUploader
              target={{ kind: "event", id: d.eventId }}
              items={d.attachments}
              onChanged={() => router.refresh()}
              empty={<p className="text-[14px] text-fg-3">Foto do quadro, lista de presença, apresentação…</p>}
            />
          )}
        </div>
      </Card>

      {/* Prévia das ações da ata */}
      <Sheet open={!!preview} onClose={() => setPreview(null)} title="Ações da ata" description="Confira e desmarque o que não deve virar ação." wide>
        <ul className="grid gap-3">
          {preview?.map((p, i) => (
            <li key={i} className={cn("rounded-[12px] border p-3", p.on ? "border-ac/40 bg-ac-soft/40" : "border-line opacity-60")}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={p.on}
                  onChange={() => setPreview((cur) => cur!.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                  className="mt-1 size-5 shrink-0 accent-[var(--ac)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] text-fg-3">- {p.line}</span>
                  <span className="mt-2 block">
                    <ParsedChips r={p.r.sectorId || !d.sectorId ? p.r : { ...p.r, sectorId: d.sectorId }} />
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Button
            block
            disabled={pending || !preview?.some((p) => p.on)}
            onClick={() => {
              const chosen = preview!.filter((p) => p.on);
              createFrom(
                chosen.map((p) => ({ title: p.line, r: p.r })),
                chosen.map((p) => p.line),
              );
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Criar {preview?.filter((p) => p.on).length ?? 0} {preview?.filter((p) => p.on).length === 1 ? "ação" : "ações"}
          </Button>
        </div>
      </Sheet>

      {/* Editar: só esta data ou a série */}
      <Sheet open={editScope === "ask"} onClose={() => setEditScope(null)} title="Editar compromisso recorrente">
        <div className="grid gap-0.5">
          <SheetOption icon={<CalendarDays />} label="Só esta data" hint={d.date.slice(8) + "/" + d.date.slice(5, 7)} onClick={() => setEditScope("single")} />
          <SheetOption icon={<Repeat />} label="Todas as datas da série" onClick={() => setEditScope("series")} />
        </div>
      </Sheet>
      {(editScope === "single" || editScope === "series") && (
        <EventForm
          open
          onClose={() => setEditScope(null)}
          options={options}
          title={editScope === "series" ? "Editar série" : isSeriesItem ? "Editar só esta data" : "Editar compromisso"}
          target={{ id: d.virtual || editScope === "single" ? d.eventId : (d.seriesId ?? d.eventId), scope: editScope, date: d.date }}
          initial={{
            title: d.title,
            type: d.type,
            date: d.date,
            start: d.start,
            end: d.end,
            allDay: d.allDay,
            location: d.location,
            sectorId: d.sectorId,
            demandId: d.demand?.id ?? null,
            linkedActionId: d.linkedAction?.id ?? null,
            attendees: d.attendees,
            reminderMinutes: d.reminderMinutes,
            rrule: editScope === "series" ? d.rrule : null,
          }}
        />
      )}

      {/* Excluir */}
      <Sheet open={deleting} onClose={() => setDeleting(false)} title="Excluir compromisso" description={d.title}>
        <div className="grid gap-0.5">
          {isSeriesItem ? (
            <>
              <SheetOption icon={<CalendarDays />} label="Só esta data" onClick={() => remove("single")} tone="danger" />
              <SheetOption icon={<Repeat />} label="Esta e as próximas" onClick={() => remove("following")} tone="danger" />
              <SheetOption icon={<Trash2 />} label="Toda a série" onClick={() => remove("all")} tone="danger" />
            </>
          ) : (
            <SheetOption icon={<Trash2 />} label="Excluir compromisso" onClick={() => remove("all")} tone="danger" />
          )}
        </div>
      </Sheet>
    </div>
  );
}
