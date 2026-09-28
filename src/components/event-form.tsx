"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { useApp } from "@/components/app-provider";
import { saveEvent } from "@/app/actions/events";
import { EVENT_TYPE_ICON, EVENT_TYPE_LABEL } from "@/lib/labels";
import { parseRule, WEEKDAY_SHORT } from "@/lib/recurrence";
import { weekdayOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { OccurrenceDTO } from "@/lib/types";

export type EventOptions = {
  demands: { id: string; title: string; sectorId: string }[];
  actions: { id: string; title: string; sectorId: string | null }[];
};

export type EventFormInitial = Partial<{
  title: string;
  type: OccurrenceDTO["type"];
  date: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  sectorId: string | null;
  demandId: string | null;
  linkedActionId: string | null;
  attendees: string | null;
  rrule: string | null;
}>;

type Repeat = "NONE" | "WORKDAYS" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "DAILY";

function repeatFromRule(rrule: string | null | undefined): { repeat: Repeat; byDay: number[]; until: string } {
  const r = parseRule(rrule);
  if (!r) return { repeat: "NONE", byDay: [], until: "" };
  const until = r.until ?? "";
  if (r.freq === "DAILY") return { repeat: r.byDay.length === 5 ? "WORKDAYS" : "DAILY", byDay: [], until };
  if (r.freq === "MONTHLY") return { repeat: "MONTHLY", byDay: [], until };
  return { repeat: r.interval === 2 ? "BIWEEKLY" : "WEEKLY", byDay: r.byDay, until };
}

const TYPES = Object.keys(EVENT_TYPE_LABEL) as OccurrenceDTO["type"][];
const field =
  "h-12 w-full rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[14px]";
const lbl = "text-[15px] font-semibold md:text-[13px]";

function addHour(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function EventForm({
  open,
  onClose,
  initial,
  target,
  options,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial?: EventFormInitial;
  target?: { id: string; scope: "single" | "series"; date?: string | null };
  options: EventOptions;
  title?: string;
}) {
  const { today, sectors } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const rep = repeatFromRule(initial?.rrule);
  const [f, setF] = useState({
    title: initial?.title ?? "",
    type: initial?.type ?? ("MEETING" as OccurrenceDTO["type"]),
    date: initial?.date ?? today,
    start: initial?.start ?? "08:00",
    end: initial?.end ?? "09:00",
    allDay: initial?.allDay ?? false,
    location: initial?.location ?? "",
    sectorId: initial?.sectorId ?? "",
    demandId: initial?.demandId ?? "",
    linkedActionId: initial?.linkedActionId ?? "",
    attendees: initial?.attendees ?? "",
    repeat: rep.repeat,
    byDay: rep.byDay,
    until: rep.until,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const showRepeat = !target || target.scope === "series";
  const demands = options.demands.filter((d) => !f.sectorId || d.sectorId === f.sectorId);
  const actions = options.actions.filter((a) => !f.sectorId || a.sectorId === f.sectorId);

  const submit = () =>
    start(async () => {
      const recurrence =
        f.repeat === "NONE"
          ? { freq: "NONE" as const }
          : f.repeat === "WORKDAYS"
            ? { freq: "DAILY" as const, byDay: [1, 2, 3, 4, 5], until: f.until || null }
            : f.repeat === "DAILY"
              ? { freq: "DAILY" as const, until: f.until || null }
              : f.repeat === "MONTHLY"
                ? { freq: "MONTHLY" as const, byMonthDay: Number(f.date.slice(8)), until: f.until || null }
                : {
                    freq: "WEEKLY" as const,
                    interval: f.repeat === "BIWEEKLY" ? 2 : 1,
                    byDay: f.byDay.length ? f.byDay : [weekdayOf(f.date)],
                    until: f.until || null,
                  };
      const r = await saveEvent(
        {
          title: f.title,
          type: f.type,
          date: f.date,
          start: f.start,
          end: f.end,
          allDay: f.allDay,
          location: f.location,
          sectorId: f.sectorId || null,
          demandId: f.demandId || null,
          linkedActionId: f.linkedActionId || null,
          attendees: f.attendees,
          recurrence: showRepeat ? recurrence : { freq: "NONE" },
        },
        target,
      );
      if (!r.ok) return void toast.error(r.error);
      toast.success(target ? "Compromisso atualizado" : "Compromisso agendado");
      onClose();
      if (!target && r.data) router.push(`/agenda/evento/${r.data.id}`);
    });

  return (
    <Sheet open={open} onClose={onClose} title={title ?? (target ? "Editar compromisso" : "Novo compromisso")} wide>
      <form
        className="grid gap-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor="ev-title" className={lbl}>
            Título
          </label>
          <input id="ev-title" data-autofocus className={field} value={f.title} onChange={(e) => set("title", e.target.value)} required placeholder="ex.: Reunião de produção" />
        </div>

        <fieldset>
          <legend className={cn(lbl, "mb-2")}>Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={f.type === t}
                onClick={() => set("type", t)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[14px] font-semibold md:h-8 md:text-[13px] [&_svg]:size-4",
                  f.type === t ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-line-strong",
                )}
              >
                <Icon name={EVENT_TYPE_ICON[t]} />
                {EVENT_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2 grid gap-1.5 md:col-span-2">
            <label htmlFor="ev-date" className={lbl}>
              Data
            </label>
            <input id="ev-date" type="date" className={field} value={f.date} onChange={(e) => set("date", e.target.value)} required />
          </div>
          {!f.allDay && (
            <>
              <div className="grid gap-1.5">
                <label htmlFor="ev-start" className={lbl}>
                  Início
                </label>
                <input
                  id="ev-start"
                  type="time"
                  className={field}
                  value={f.start}
                  onChange={(e) => {
                    const v = e.target.value;
                    setF((s) => ({ ...s, start: v, end: s.end <= v ? addHour(v) : s.end }));
                  }}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="ev-end" className={lbl}>
                  Fim
                </label>
                <input id="ev-end" type="time" className={field} value={f.end} onChange={(e) => set("end", e.target.value)} required />
              </div>
            </>
          )}
        </div>
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} className="size-5 accent-[var(--ac)]" />
          Dia inteiro
        </label>

        {showRepeat && (
          <div className="grid gap-3 rounded-[12px] border border-line p-3">
            <div className="grid gap-1.5">
              <label htmlFor="ev-repeat" className={lbl}>
                Repetir
              </label>
              <select id="ev-repeat" className={field} value={f.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)}>
                <option value="NONE">Não repete</option>
                <option value="WORKDAYS">Todo dia útil (seg a sex)</option>
                <option value="DAILY">Todo dia</option>
                <option value="WEEKLY">Toda semana</option>
                <option value="BIWEEKLY">A cada 2 semanas</option>
                <option value="MONTHLY">Todo mês, dia {Number(f.date.slice(8))}</option>
              </select>
            </div>
            {(f.repeat === "WEEKLY" || f.repeat === "BIWEEKLY") && (
              <fieldset>
                <legend className={cn(lbl, "mb-2")}>Nos dias</legend>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const on = f.byDay.length ? f.byDay.includes(d) : d === weekdayOf(f.date);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const cur = f.byDay.length ? f.byDay : [weekdayOf(f.date)];
                          set("byDay", on ? cur.filter((x) => x !== d) : [...cur, d]);
                        }}
                        className={cn("h-10 min-w-11 rounded-[10px] border px-2 text-[14px] font-semibold capitalize", on ? "border-ac bg-ac-soft text-ac-text" : "border-line text-fg-2")}
                      >
                        {WEEKDAY_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {f.repeat !== "NONE" && (
              <div className="grid gap-1.5">
                <label htmlFor="ev-until" className={lbl}>
                  Até (opcional)
                </label>
                <input id="ev-until" type="date" min={f.date} className={field} value={f.until} onChange={(e) => set("until", e.target.value)} />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="ev-loc" className={lbl}>
              Local
            </label>
            <input id="ev-loc" className={field} value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Sala de reuniões, cliente, Teams…" />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="ev-sector" className={lbl}>
              Setor
            </label>
            <select id="ev-sector" className={field} value={f.sectorId} onChange={(e) => setF((s) => ({ ...s, sectorId: e.target.value, demandId: "", linkedActionId: "" }))}>
              <option value="">Nenhum</option>
              {sectors.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.parentId ? `  ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="ev-demand" className={lbl}>
              Demanda relacionada
            </label>
            <select id="ev-demand" className={field} value={f.demandId} onChange={(e) => set("demandId", e.target.value)}>
              <option value="">Nenhuma</option>
              {demands.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="ev-action" className={lbl}>
              Ação relacionada
            </label>
            <select id="ev-action" className={field} value={f.linkedActionId} onChange={(e) => set("linkedActionId", e.target.value)}>
              <option value="">Nenhuma</option>
              {actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="ev-att" className={lbl}>
            Participantes
          </label>
          <input id="ev-att" className={field} value={f.attendees} onChange={(e) => set("attendees", e.target.value)} placeholder="ex.: Anderson, Ricardo, Fernanda" />
        </div>
        <Button type="submit" block disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {target ? "Salvar alterações" : "Agendar"}
        </Button>
      </form>
    </Sheet>
  );
}
