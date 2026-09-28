"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, ListChecks, Paperclip, Plus, Repeat } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/button";
import { EmptyState, SectorChip, SectorTile } from "@/components/ds";
import { Icon } from "@/components/icon";
import { EventForm, type EventFormInitial, type EventOptions } from "@/components/event-form";
import { addDaysISO, diffDays, formatBR, weekdayOf } from "@/lib/dates";
import { EVENT_TYPE_ICON, EVENT_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { OccurrenceDTO } from "@/lib/types";

export type AgendaMode = "dia" | "semana" | "mes";

const WD_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WD_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const HOUR_START = 7;
const HOUR_END = 21;
const HOUR_PX = 52;

const dm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function shiftMonth(iso: string, n: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function AgendaView({
  mode,
  date,
  from,
  to,
  items,
  now,
  options,
}: {
  mode: AgendaMode;
  date: string;
  from: string;
  to: string;
  items: OccurrenceDTO[];
  now: string;
  options: EventOptions;
}) {
  const { today } = useApp();
  const router = useRouter();
  const [creating, setCreating] = useState<EventFormInitial | null>(null);

  const go = (v: AgendaMode, d: string) => router.push(`/agenda?v=${v}&d=${d}`, { scroll: false });
  const step = (n: number) => go(mode, mode === "dia" ? addDaysISO(date, n) : mode === "semana" ? addDaysISO(date, 7 * n) : shiftMonth(date, n));

  const label =
    mode === "dia"
      ? `${WD_LONG[weekdayOf(date)]}, ${formatBR(date)}`
      : mode === "semana"
        ? `${dm(from)} – ${dm(to)}`
        : `${MONTHS[Number(date.slice(5, 7)) - 1]} de ${date.slice(0, 4)}`;

  const byDay = new Map<string, OccurrenceDTO[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 md:px-7 md:pt-6">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Agenda</h1>
          <p className="text-[15px] font-medium capitalize text-fg-3 md:text-[14px]">{label}</p>
        </div>
        <Button size="sm" className="mt-1" onClick={() => setCreating({ date: mode === "dia" ? date : date < today && mode !== "mes" ? today : date })}>
          <Plus /> Novo
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-7">
        <div className="inline-flex rounded-[10px] bg-surface-2 p-[3px]" role="tablist" aria-label="Visão">
          {(
            [
              ["dia", "Dia"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => go(k, date)}
              className={cn("h-9 rounded-[8px] px-3.5 text-[15px] font-semibold text-fg-2 md:h-7 md:text-[13px]", mode === k && "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--line)]")}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface md:size-8" aria-label="Anterior">
            <ChevronLeft className="size-5 md:size-4" />
          </button>
          <button type="button" onClick={() => go(mode, today)} className="h-10 rounded-[10px] border border-line bg-surface px-3 text-[14px] font-semibold md:h-8 md:text-[13px]">
            Hoje
          </button>
          <button type="button" onClick={() => step(1)} className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface md:size-8" aria-label="Próximo">
            <ChevronRight className="size-5 md:size-4" />
          </button>
        </div>
      </div>

      {mode === "dia" && (
        <div className="px-4 md:px-7">
          <DayList items={byDay.get(date) ?? []} isToday={date === today} now={now} onNew={() => setCreating({ date })} />
        </div>
      )}

      {mode === "semana" && (
        <>
          {/* Celular: lista por dia */}
          <div className="grid gap-4 px-4 md:hidden">
            {Array.from({ length: 7 }, (_, i) => addDaysISO(from, i)).map((d) => (
              <section key={d}>
                <h2 className={cn("mb-1.5 flex items-center gap-2 px-1 text-[15px] font-bold", d === today ? "text-ac-text" : "text-fg-2")}>
                  <Link href={`/agenda?v=dia&d=${d}`} className="capitalize">
                    {WD_LONG[weekdayOf(d)]}, {dm(d)}
                  </Link>
                  {d === today && <span className="rounded-[6px] bg-ac-soft px-1.5 text-[12px] font-bold uppercase tracking-wide">hoje</span>}
                </h2>
                {(byDay.get(d) ?? []).length === 0 ? (
                  <button type="button" onClick={() => setCreating({ date: d })} className="w-full rounded-[12px] border border-dashed border-line px-3.5 py-2.5 text-left text-[14px] text-fg-3">
                    Livre · toque para agendar
                  </button>
                ) : (
                  <ul className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
                    {(byDay.get(d) ?? []).map((e) => (
                      <EventRow key={e.key} e={e} past={d < today || (d === today && e.end <= now && !e.allDay)} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
          {/* Desktop: grade de horários */}
          <div className="hidden px-7 md:block">
            <WeekGrid from={from} byDay={byDay} today={today} now={now} onSlot={(d, t) => setCreating({ date: d, start: t, end: `${String(Math.min(23, Number(t.slice(0, 2)) + 1)).padStart(2, "0")}:00` })} />
          </div>
        </>
      )}

      {mode === "mes" && (
        <div className="px-4 md:px-7">
          <MonthGrid from={from} to={to} month={date.slice(0, 7)} byDay={byDay} today={today} />
        </div>
      )}

      {creating && <EventForm open onClose={() => setCreating(null)} initial={creating} options={options} />}
    </div>
  );
}

export function EventRow({ e, past, showDate }: { e: OccurrenceDTO; past?: boolean; showDate?: boolean }) {
  const { sectorById } = useApp();
  return (
    <li className="border-t border-line first:border-t-0">
      <Link href={e.href} className={cn("grid grid-cols-[58px_1fr] gap-2.5 px-3.5 py-3 hover:bg-surface-2 md:grid-cols-[64px_1fr]", past && "opacity-60")}>
        <div className="font-mono text-[15px] font-semibold leading-tight md:text-[13px]">
          {showDate && <small className="block text-[12px] font-medium text-fg-3">{dm(e.date)}</small>}
          {e.allDay ? "dia todo" : e.start}
          {!e.allDay && <small className="block text-[13px] font-medium text-fg-3 md:text-[12px]">{e.end}</small>}
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-snug md:text-[14px]">{e.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-fg-3 md:text-[13px]">
            <SectorChip sector={sectorById(e.sectorId)} />
            <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">
              <Icon name={EVENT_TYPE_ICON[e.type]} />
              {EVENT_TYPE_LABEL[e.type]}
            </span>
            {e.recurring && (
              <span className="inline-flex items-center gap-1" title={e.ruleText}>
                <Repeat className="size-3.5" /> {e.ruleText || "recorrente"}
              </span>
            )}
            {e.location && <span className="truncate">{e.location}</span>}
            {e.hasMinutes && (
              <span className="inline-flex items-center gap-1 font-medium text-fg-2">
                <FileText className="size-3.5" /> ata
              </span>
            )}
            {e.actionsCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-fg-2">
                <ListChecks className="size-3.5" /> {e.actionsCount}
              </span>
            )}
            {e.attachmentsCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-fg-2">
                <Paperclip className="size-3.5" /> {e.attachmentsCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function DayList({ items, isToday, now, onNew }: { items: OccurrenceDTO[]; isToday: boolean; now: string; onNew: () => void }) {
  if (!items.length)
    return (
      <EmptyState title="Nada marcado">
        <div className="mt-3">
          <Button size="sm" onClick={onNew}>
            <Plus /> Agendar compromisso
          </Button>
        </div>
      </EmptyState>
    );
  const nowIdx = isToday ? items.findIndex((e) => !e.allDay && e.start > now) : -1;
  return (
    <ul className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
      {items.map((e, i) => (
        <div key={e.key}>
          {i === nowIdx && i > 0 && (
            <div className="relative z-[1] flex h-0 items-center gap-2 px-3.5 font-mono text-[12px] font-bold text-ac-text" aria-label={`Agora ${now}`}>
              <span className="size-2 rounded-full bg-ac" />
              <span className="bg-surface px-1.5">agora {now}</span>
              <span className="h-0.5 flex-1 bg-ac" />
            </div>
          )}
          <EventRow e={e} past={isToday && !e.allDay && e.end <= now} />
        </div>
      ))}
    </ul>
  );
}

/** Distribui eventos que se sobrepõem em colunas lado a lado. */
function lanes(list: OccurrenceDTO[]) {
  const timed = list.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const ends: number[] = [];
  const out = timed.map((e) => {
    const s = toMin(e.start);
    let lane = ends.findIndex((end) => end <= s);
    if (lane < 0) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = Math.max(s + 15, toMin(e.end));
    return { e, lane };
  });
  return { placed: out, count: Math.max(1, ends.length) };
}

function WeekGrid({ from, byDay, today, now, onSlot }: { from: string; byDay: Map<string, OccurrenceDTO[]>; today: string; now: string; onSlot: (d: string, t: string) => void }) {
  const { sectorById } = useApp();
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(from, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const height = hours.length * HOUR_PX;
  const hasAllDay = days.some((d) => (byDay.get(d) ?? []).some((e) => e.allDay));

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-card">
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line">
        <div />
        {days.map((d) => (
          <Link key={d} href={`/agenda?v=dia&d=${d}`} className={cn("border-l border-line px-2 py-2 text-center hover:bg-surface-2", d === today && "bg-ac-soft")}>
            <span className={cn("block text-[12px] font-semibold uppercase tracking-wide", d === today ? "text-ac-text" : "text-fg-3")}>{WD_SHORT[weekdayOf(d)]}</span>
            <span className={cn("block text-[18px] font-bold leading-tight", d === today && "text-ac-text")}>{d.slice(8)}</span>
          </Link>
        ))}
      </div>
      {hasAllDay && (
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line">
          <div className="px-1 py-1.5 text-right text-[11px] text-fg-3">dia todo</div>
          {days.map((d) => (
            <div key={d} className="grid gap-1 border-l border-line p-1">
              {(byDay.get(d) ?? [])
                .filter((e) => e.allDay)
                .map((e) => (
                  <Link key={e.key} href={e.href} className="truncate rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold">
                    {e.title}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      )}
      <div className="max-h-[calc(100dvh-260px)] overflow-y-auto">
        <div className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" style={{ height }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-fg-3" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const { placed, count } = lanes(byDay.get(d) ?? []);
            return (
              <div
                key={d}
                className={cn("relative border-l border-line", d === today && "bg-[color-mix(in_srgb,var(--ac-soft)_35%,transparent)]")}
                onClick={(ev) => {
                  if ((ev.target as HTMLElement).closest("a")) return;
                  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  const h = HOUR_START + Math.floor((ev.clientY - rect.top) / HOUR_PX);
                  onSlot(d, `${String(Math.min(22, h)).padStart(2, "0")}:00`);
                }}
                role="presentation"
              >
                {hours.map((h, i) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
                ))}
                {d === today && toMin(now) >= HOUR_START * 60 && toMin(now) < HOUR_END * 60 && (
                  <div className="absolute inset-x-0 z-[2] h-0.5 bg-ac" style={{ top: ((toMin(now) - HOUR_START * 60) / 60) * HOUR_PX }}>
                    <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-ac" />
                  </div>
                )}
                {placed.map(({ e, lane }) => {
                  const top = Math.max(0, ((toMin(e.start) - HOUR_START * 60) / 60) * HOUR_PX);
                  const bottom = Math.min(height, ((toMin(e.end) - HOUR_START * 60) / 60) * HOUR_PX);
                  const past = d < today || (d === today && e.end <= now);
                  const s = sectorById(e.sectorId);
                  return (
                    <Link
                      key={e.key}
                      href={e.href}
                      title={`${e.start}–${e.end} ${e.title}`}
                      className={cn(
                        "absolute z-[1] overflow-hidden rounded-[8px] border px-1.5 py-1 text-[12px] leading-tight shadow-card hover:z-[3] hover:shadow-float",
                        e.type === "PERSONAL_BLOCK" ? "border-line bg-surface-2 text-fg-2" : "border-ac/30 bg-ac-soft text-fg",
                        past && "opacity-60",
                      )}
                      style={{ top: top + 1, height: Math.max(22, bottom - top - 2), left: `calc(${(lane / count) * 100}% + 2px)`, width: `calc(${100 / count}% - 4px)` }}
                    >
                      <span className="block font-mono text-[11px] text-fg-3">{e.start}</span>
                      <span className="line-clamp-3 font-semibold">{e.title}</span>
                      {s && bottom - top > 64 && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-3">
                          <SectorTile sector={s} size={14} /> {s.shortName || s.name}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ from, to, month, byDay, today }: { from: string; to: string; month: string; byDay: Map<string, OccurrenceDTO[]>; today: string }) {
  const total = diffDays(from, to) + 1;
  const days = Array.from({ length: total }, (_, i) => addDaysISO(from, i));
  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div key={w} className="py-1.5 text-center text-[12px] font-semibold uppercase tracking-wide text-fg-3">
            {WD_SHORT[w]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          return (
            <Link
              key={d}
              href={`/agenda?v=dia&d=${d}`}
              className={cn("min-h-[64px] border-line p-1 hover:bg-surface-2 md:min-h-[104px] md:p-1.5", i % 7 !== 0 && "border-l", i >= 7 && "border-t", !inMonth && "bg-bg/60")}
              aria-label={`${formatBR(d)}: ${list.length} compromissos`}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-[14px] font-semibold md:text-[13px]",
                  d === today ? "bg-ac text-ac-fg" : inMonth ? "text-fg" : "text-fg-3",
                )}
              >
                {Number(d.slice(8))}
              </span>
              {/* celular: pontinhos */}
              <span className="mt-1 flex flex-wrap gap-0.5 px-1 md:hidden">
                {list.slice(0, 4).map((e) => (
                  <span key={e.key} className={cn("size-1.5 rounded-full", e.type === "PERSONAL_BLOCK" ? "bg-line-strong" : "bg-ac")} />
                ))}
              </span>
              {/* desktop: títulos */}
              <span className="mt-1 hidden gap-0.5 md:grid">
                {list.slice(0, 3).map((e) => (
                  <span key={e.key} className="truncate rounded-[5px] bg-ac-soft px-1 text-[11px] font-medium text-fg">
                    {!e.allDay && <span className="font-mono text-fg-3">{e.start} </span>}
                    {e.title}
                  </span>
                ))}
                {list.length > 3 && <span className="px-1 text-[11px] text-fg-3">+{list.length - 3}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
