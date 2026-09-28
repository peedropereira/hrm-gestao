"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, History, Sun, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/app-provider";
import { DueBadge, KindLabel, PersonChip, SectorChip } from "@/components/ds";
import { Sheet, SheetOption } from "@/components/sheet";
import { addDaysISO, brToISO, businessDaysBetween, formatShort, nextMondayISO } from "@/lib/dates";
import type { ActionDTO } from "@/lib/types";

/** Círculo de concluir com check animado. */
export function CheckButton({ a, size = "md" }: { a: ActionDTO; size?: "md" | "sm" }) {
  const { complete, reopen } = useApp();
  const done = a.status === "DONE";
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={`${done ? "Reabrir" : "Concluir"}: ${a.title}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (done) reopen(a);
        else complete(a);
      }}
      className={cn("group grid shrink-0 place-items-center", size === "md" ? "size-11" : "size-8")}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full border-2 transition-[background,border-color,transform] duration-200 ease-[cubic-bezier(.3,1.6,.5,1)]",
          size === "md" ? "size-6" : "size-[18px] border-[1.75px]",
          done ? "scale-110 border-green-solid bg-green-solid" : "border-line-strong group-hover:border-green-solid",
        )}
      >
        <svg viewBox="0 0 24 24" className={size === "md" ? "size-3.5" : "size-[11px]"} aria-hidden="true">
          <path
            d="M5 12.5l4.2 4.2L19 7"
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={20}
            style={{
              stroke: "var(--on-green)",
              strokeDasharray: 20,
              strokeDashoffset: done ? 0 : 20,
              transition: "stroke-dashoffset .26s .06s ease-out",
            }}
          />
        </svg>
      </span>
    </button>
  );
}

export function useFollowUp(a: ActionDTO) {
  const { today, delegateAlertDays } = useApp();
  if (!a.assigneeId || a.status === "DONE") return null;
  const since = a.lastFollowUpAt ?? a.createdAt.slice(0, 10);
  const days = businessDaysBetween(since, today);
  const late = days > (a.alertAfterDays ?? delegateAlertDays);
  return { days, late };
}

export function FollowUpLine({ a }: { a: ActionDTO }) {
  const fu = useFollowUp(a);
  if (!fu) return null;
  return (
    <div className={cn("mt-1.5 flex items-center gap-1.5 text-[14px] md:text-[13px]", fu.late ? "font-semibold text-amber" : "text-fg-3")}>
      <History className="size-[15px]" aria-hidden="true" />
      {fu.days === 0 ? "Follow-up hoje" : `Último follow-up há ${fu.days} ${fu.days === 1 ? "dia útil" : "dias úteis"}`}
      {fu.late && " · cobrar"}
    </div>
  );
}

/** Folha "Adiar": amanhã, próxima segunda ou escolher data. */
export function SnoozeSheet({ a, open, onClose }: { a: ActionDTO | null; open: boolean; onClose: () => void }) {
  const { today, snooze } = useApp();
  const [picking, setPicking] = useState(false);
  const [value, setValue] = useState("");
  const tomorrow = addDaysISO(today, 1);
  const monday = nextMondayISO(today);
  const pick = (d: string) => {
    if (a) snooze(a, d);
    setPicking(false);
    onClose();
  };
  return (
    <Sheet open={open} onClose={() => { setPicking(false); onClose(); }} title="Adiar ação" description={a?.title}>
      {!picking ? (
        <div className="grid gap-0.5">
          <SheetOption icon={<Sun />} label="Amanhã" hint={formatShort(tomorrow)} onClick={() => pick(tomorrow)} />
          <SheetOption icon={<CalendarDays />} label="Próxima segunda" hint={formatShort(monday)} onClick={() => pick(monday)} />
          <SheetOption icon={<CalendarClock />} label="Escolher data" onClick={() => setPicking(true)} />
        </div>
      ) : (
        <form
          className="grid gap-3 px-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : brToISO(value, Number(today.slice(0, 4)));
            if (iso) pick(iso);
          }}
        >
          <label htmlFor="snooze-date" className="text-[15px] font-semibold">
            Nova data
          </label>
          <input
            id="snooze-date"
            type="date"
            min={today}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-12 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px]"
            data-autofocus
          />
          <button type="submit" className="h-12 rounded-[12px] bg-ac font-semibold text-ac-fg">
            Adiar
          </button>
        </form>
      )}
    </Sheet>
  );
}

/** Cartão de ação no celular: deslize para a direita conclui, para a esquerda adia. */
export function SwipeCard({ a, href }: { a: ActionDTO; href: string }) {
  const { today, sectorById, personById, complete } = useApp();
  const [snoozing, setSnoozing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const x = useMotionValue(0);
  const leftOpacity = useTransform(x, [0, 40], [0, 1]);
  const rightOpacity = useTransform(x, [-40, 0], [1, 0]);

  return (
    <motion.div
      layout
      className="relative mx-4 mb-2 overflow-hidden rounded-[14px]"
      animate={leaving ? { opacity: 0, x: 28 } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.28 }}
    >
      <motion.div style={{ opacity: leftOpacity }} className="absolute inset-0 flex items-center gap-2 bg-green-solid px-5 text-[16px] font-bold text-on-green" aria-hidden="true">
        <Check className="size-[22px]" /> Concluir
      </motion.div>
      <motion.div style={{ opacity: rightOpacity }} className="absolute inset-0 flex items-center justify-end gap-2 bg-ac px-5 text-[16px] font-bold text-ac-fg" aria-hidden="true">
        Adiar <Clock className="size-[22px]" />
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        style={{ x, touchAction: "pan-y" }}
        onDragEnd={(_, info) => {
          if (info.offset.x > 90) {
            setLeaving(true);
            setTimeout(() => complete(a), 180);
          } else if (info.offset.x < -90) {
            setSnoozing(true);
          }
          animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
        }}
        className="relative flex gap-1 rounded-[14px] border border-line bg-surface py-1 pl-1 pr-3.5 shadow-card"
      >
        <CheckButton a={a} />
        <Link href={href} className="min-w-0 flex-1 pb-2.5 pt-2" draggable={false}>
          <div className={cn("text-[17px] font-medium leading-snug", a.status === "DONE" && "text-fg-3 line-through")}>{a.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <DueBadge a={a} today={today} />
            <SectorChip sector={sectorById(a.sectorId)} />
            {a.assigneeId && <PersonChip person={personById(a.assigneeId)} />}
            <KindLabel kind={a.kind} />
            {a.subtasksTotal > 0 && (
              <span className="font-mono text-[13px] text-fg-3">
                {a.subtasksDone}/{a.subtasksTotal}
              </span>
            )}
          </div>
          <FollowUpLine a={a} />
        </Link>
      </motion.div>
      <SnoozeSheet a={a} open={snoozing} onClose={() => setSnoozing(false)} />
    </motion.div>
  );
}

export function SwipeHint() {
  return (
    <div className="flex items-center gap-1.5 px-5 pb-1 pt-0.5 text-[14px] text-fg-3 md:hidden">
      <ArrowRight className="size-[15px]" aria-hidden="true" />
      deslize para concluir ·
      <ArrowLeft className="size-[15px]" aria-hidden="true" />
      para adiar
    </div>
  );
}
