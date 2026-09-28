"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarCheck, ChevronRight, Inbox, Repeat, Search } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { CheckButton, FollowUpLine } from "@/components/action-bits";
import { Card, Dot, DueBadge, EmptyState, HealthLabel, PanelHead, SectionHead, SectorChip, SectorTile, Spark } from "@/components/ds";
import { Icon } from "@/components/icon";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { setPriorities } from "@/app/actions/actions";
import { formatExtenso, formatLong } from "@/lib/dates";
import { EVENT_TYPE_ICON, EVENT_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionDTO, SectorHealth } from "@/lib/types";
import type { EventType } from "@/generated/prisma/enums";

export type TodayEvent = { id: string; title: string; type: EventType; start: string; end: string; sectorId: string | null; recurring: boolean; past: boolean };

type Props = {
  open: ActionDTO[];
  priorities: ActionDTO[];
  events: TodayEvent[];
  now: string;
  health: SectorHealth[];
  inboxCount: number;
  overdueTrend: number[];
  doneTrend: number[];
};

function greetingNow() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function TodayView(p: Props) {
  const { today, userName, applyOverlay, sectorById, setSearchOpen } = useApp();
  const [editing, setEditing] = useState(false);

  const open = applyOverlay(p.open).filter((a) => a.status !== "DONE");
  const prios = applyOverlay(p.priorities);
  const overdue = open.filter((a) => a.dueDate && a.dueDate < today);
  const dueToday = open.filter((a) => a.dueDate === today);
  const waiting = open.filter((a) => a.assigneeId);
  const decisions = dueToday.filter((a) => a.kind === "DECIDE").length;
  const prioIds = new Set(prios.map((a) => a.id));
  const others = [...overdue, ...dueToday].filter((a) => !prioIds.has(a.id));
  const trend = [...p.overdueTrend.slice(0, -1), overdue.length];

  const attention = p.health.filter((h) => h.status !== "green").sort((a, b) => (a.status === "red" ? 0 : 1) - (b.status === "red" ? 0 : 1));
  const ok = p.health.filter((h) => h.status === "green");
  const greet = greetingNow();

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Cabeçalho */}
      <header className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-5 pb-2.5 pt-3 md:px-7 md:pb-0 md:pt-6">
        <p className="text-[15px] font-medium text-fg-3 md:hidden">{formatLong(today).replace("-feira", "")}</p>
        <div className="col-span-2 md:col-span-1 md:row-start-1">
          <h1 className="mt-0.5 text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">
            {greet}, {userName.split(" ")[0]}
          </h1>
          <p className="hidden text-[14px] text-fg-3 md:block">{formatLong(today).split(",")[0]}, {formatExtenso(today)}</p>
        </div>
        <div className="col-start-2 row-start-1 flex gap-2 md:hidden">
          <button type="button" onClick={() => setSearchOpen(true)} className="grid size-11 place-items-center rounded-[12px] border border-line bg-surface text-fg-2" aria-label="Buscar">
            <Search className="size-5" />
          </button>
          <Link href="/caixa" className="relative grid size-11 place-items-center rounded-[12px] border border-line bg-surface text-fg-2" aria-label={`Caixa de entrada, ${p.inboxCount} itens`}>
            <Inbox className="size-5" />
            {p.inboxCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-bg bg-ac px-1 text-[12px] font-bold text-ac-fg">{p.inboxCount}</span>
            )}
          </Link>
          <Link href="/config" className="grid size-11 place-items-center rounded-full bg-ac-soft text-[14px] font-bold text-ac-text" aria-label="Configurações, revisão e relatórios">
            {userName.slice(0, 2).toUpperCase()}
          </Link>
        </div>
        <Link href="/revisao" className="col-start-2 row-start-1 hidden h-9 items-center gap-2 rounded-[9px] border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2 md:inline-flex">
          <CalendarCheck className="size-[15px]" /> Revisão de sexta
        </Link>
      </header>

      {/* Números-chave */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-1.5 md:grid-cols-2 md:gap-3 lg:grid-cols-4 md:px-7 md:pt-5">
        <Link href="/acoes?f=atrasadas" className="flex min-h-[112px] flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-3 shadow-card md:grid md:min-h-0 md:grid-cols-[1fr_auto] md:items-end md:gap-x-3 md:rounded-[12px] md:px-4 md:py-3.5">
          <span className="order-2 text-[15px] font-medium text-fg-2 md:order-none md:col-span-2 md:text-[13px]">atrasadas</span>
          <span className="order-1 text-[38px] font-bold leading-none tracking-[-0.035em] text-red md:order-none md:text-[36px]">{overdue.length}</span>
          <Spark values={trend} color="var(--red-solid)" width={90} height={24} className="order-3 mt-auto md:order-none md:mt-0 md:h-[30px] md:w-[96px]" />
          <span className="hidden text-[12px] text-fg-3 md:col-span-2 md:block">últimas 8 semanas</span>
        </Link>
        <Link href="/acoes?f=hoje" className="flex min-h-[112px] flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-3 shadow-card md:grid md:min-h-0 md:grid-cols-[1fr_auto] md:items-end md:rounded-[12px] md:px-4 md:py-3.5">
          <span className="order-2 text-[15px] font-medium text-fg-2 md:order-none md:col-span-2 md:text-[13px]">vencem hoje</span>
          <span className="order-1 text-[38px] font-bold leading-none tracking-[-0.035em] md:order-none md:text-[36px]">{dueToday.length}</span>
          <span className="order-3 mt-auto text-[14px] text-fg-3 md:order-none md:col-span-2 md:mt-1 md:text-[12px]">
            {decisions} {decisions === 1 ? "é decisão" : "são decisões"}
          </span>
        </Link>
        <Link href="/acoes?f=delegadas" className="hidden rounded-[12px] border border-line bg-surface px-4 py-3.5 shadow-card md:grid md:grid-cols-[1fr_auto] md:items-end md:gap-x-3">
          <span className="col-span-2 text-[13px] font-medium text-fg-2">aguardando retorno</span>
          <span className="text-[36px] font-bold leading-none tracking-[-0.035em]">{waiting.length}</span>
          <span />
          <span className="col-span-2 mt-1 text-[12px] text-fg-3">delegadas e cobranças abertas</span>
        </Link>
        <Link href="/caixa" className="flex min-h-[112px] flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-3 shadow-card md:grid md:min-h-0 md:grid-cols-[1fr_auto] md:items-end md:rounded-[12px] md:px-4 md:py-3.5">
          <span className="order-2 text-[15px] font-medium text-fg-2 md:order-none md:col-span-2 md:text-[13px]">na caixa</span>
          <span className="order-1 text-[38px] font-bold leading-none tracking-[-0.035em] md:order-none md:text-[36px]">{p.inboxCount}</span>
          <span className="order-3 mt-auto flex items-center gap-0.5 text-[15px] font-semibold text-ac-text md:order-none md:col-span-2 md:mt-1 md:text-[12px]">
            Triar <ChevronRight className="size-4" />
          </span>
        </Link>
      </div>

      <div className="md:grid md:gap-4 md:px-7 md:pt-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 md:grid md:content-start md:gap-4 [&>*]:min-w-0">
          {/* Prioridades */}
          <section className="px-4 pt-6 md:p-0">
            <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              <div className="md:hidden">
                <SectionHead title="Prioridades do dia">
                  <button type="button" onClick={() => setEditing(true)} className="tap flex items-center text-[15px] font-semibold text-ac-text">
                    {prios.length ? "Escolher" : "Definir"}
                  </button>
                </SectionHead>
              </div>
              <div className="hidden md:block">
                <PanelHead title="Prioridades do dia" count={prios.length}>
                  <button type="button" onClick={() => setEditing(true)} className="text-[13px] font-semibold text-ac-text">
                    Escolher e ordenar
                  </button>
                </PanelHead>
              </div>
              {prios.length === 0 ? (
                <EmptyState title="Nenhuma prioridade escolhida" className="m-0 md:m-4">
                  Escolha até 5 ações para focar hoje.
                  <div className="mt-3">
                    <Button size="sm" onClick={() => setEditing(true)}>
                      Escolher prioridades
                    </Button>
                  </div>
                </EmptyState>
              ) : (
                <ol className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card md:rounded-none md:border-0 md:shadow-none">
                  {prios.map((a, i) => (
                    <PriorityRow key={a.id} a={a} n={i + 1} />
                  ))}
                </ol>
              )}
            </Card>
          </section>

          {/* Atrasadas e de hoje (fora das prioridades) */}
          {others.length > 0 && (
            <section className="px-4 pt-6 md:p-0">
              <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
                <div className="md:hidden">
                  <SectionHead title="Também atrasadas ou para hoje">
                    <Link href="/acoes?f=atrasadas" className="tap flex items-center gap-1 text-[15px] font-semibold text-ac-text">
                      Todas <ChevronRight className="size-4" />
                    </Link>
                  </SectionHead>
                </div>
                <div className="hidden md:block">
                  <PanelHead title="Também atrasadas ou para hoje" count={others.length}>
                    <Link href="/acoes?f=atrasadas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ac-text">
                      Abrir em Ações <ArrowUpRight className="size-3.5" />
                    </Link>
                  </PanelHead>
                </div>
                <ul className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card md:rounded-none md:border-0 md:shadow-none">
                  {others.slice(0, 8).map((a) => (
                    <PriorityRow key={a.id} a={a} />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {others.length === 0 && overdue.length === 0 && (
            <div className="px-4 pt-6 md:p-0">
              <EmptyState title="Nenhuma ação atrasada 👏">Toque em + para capturar algo novo.</EmptyState>
            </div>
          )}
        </div>

        <div className="min-w-0 md:grid md:content-start md:gap-4 [&>*]:min-w-0">
          {/* Agenda */}
          <section className="px-4 pt-6 md:p-0">
            <div className="md:hidden">
              <SectionHead title="Agenda de hoje">
                <Link href="/agenda" className="tap flex items-center gap-1 text-[15px] font-semibold text-ac-text">
                  Agenda <ChevronRight className="size-4" />
                </Link>
              </SectionHead>
            </div>
            <Card>
              <div className="hidden md:block">
                <PanelHead title="Agenda de hoje" count={p.events.length} />
              </div>
              {p.events.length === 0 ? (
                <p className="px-4 py-5 text-[15px] text-fg-3">Nenhum compromisso hoje.</p>
              ) : (
                <AgendaList events={p.events} now={p.now} />
              )}
            </Card>
          </section>

          {/* Semáforo */}
          <section className="px-4 pt-6 md:p-0">
            <div className="md:hidden">
              <SectionHead title="Setores">
                <Link href="/setores" className="tap flex items-center gap-1 text-[15px] font-semibold text-ac-text">
                  Todos <ChevronRight className="size-4" />
                </Link>
              </SectionHead>
            </div>
            <Card>
              <div className="hidden md:block">
                <PanelHead title="Semáforo dos setores">
                  <span className="text-[13px] text-fg-3">
                    {p.health.filter((h) => h.status === "red").length} críticos · {p.health.filter((h) => h.status === "amber").length} atenção
                  </span>
                </PanelHead>
              </div>
              {/* Celular: só quem pede atenção */}
              <ul className="md:hidden">
                {attention.map((h) => {
                  const s = sectorById(h.sectorId);
                  if (!s) return null;
                  return (
                    <li key={h.sectorId} className="border-t border-line first:border-t-0">
                      <Link href={`/setores/${s.slug}`} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5">
                        <SectorTile sector={s} size={38} />
                        <span className="min-w-0 flex-1">
                          <b className="block text-[16px] font-semibold">{s.shortName || s.name}</b>
                          <span className="text-[14px] text-fg-2">{h.reason}</span>
                        </span>
                        <HealthLabel status={h.status} />
                      </Link>
                    </li>
                  );
                })}
                <li className="border-t border-line first:border-t-0">
                  <Link href="/setores" className="flex items-center gap-2.5 px-3.5 py-3.5 text-[15px] font-medium text-fg-2">
                    <Dot status="green" />
                    {ok.length} {ok.length === 1 ? "setor em dia" : "setores em dia"}
                    <span className="ml-auto flex">
                      {ok.slice(0, 5).map((h) => {
                        const s = sectorById(h.sectorId);
                        return s ? <SectorTile key={h.sectorId} sector={s} size={26} className="-ml-1.5 border-2 border-surface" /> : null;
                      })}
                    </span>
                  </Link>
                </li>
              </ul>
              {/* Desktop: grade compacta com todos */}
              <div className="hidden grid-cols-2 md:grid">
                {p.health.map((h) => {
                  const s = sectorById(h.sectorId);
                  if (!s) return null;
                  return (
                    <Link
                      key={h.sectorId}
                      href={`/setores/${s.slug}`}
                      title={h.reason}
                      className="flex min-w-0 items-center gap-2 border-t border-line px-3.5 py-2 text-[13px] odd:border-r [&:nth-child(-n+2)]:border-t-0 hover:bg-surface-2"
                    >
                      <SectorTile sector={s} size={22} />
                      <span className="min-w-0 flex-1 truncate">{s.shortName || s.name}</span>
                      <Dot status={h.status} className="size-2" />
                    </Link>
                  );
                })}
              </div>
            </Card>
          </section>
        </div>
      </div>

      <PrioritiesSheet open={editing} onClose={() => setEditing(false)} candidates={open} current={prios} />
    </div>
  );
}

function PriorityRow({ a, n }: { a: ActionDTO; n?: number }) {
  const { today, sectorById } = useApp();
  const done = a.status === "DONE";
  return (
    <li className="flex items-start gap-1 border-t border-line py-1.5 pl-1.5 pr-3.5 first:border-t-0 md:items-center md:py-0.5 md:pl-1.5">
      {n !== undefined && <span className="w-[18px] shrink-0 pt-[13px] text-right font-mono text-[14px] font-semibold text-fg-3 md:pt-0 md:text-[12px]">{n}</span>}
      <CheckButton a={a} />
      <Link href={`/acoes/${a.id}`} className="min-w-0 flex-1 pb-2 pt-2 md:flex md:items-center md:gap-3 md:py-2.5">
        <span className={cn("block text-[17px] font-medium leading-snug md:flex-1 md:truncate md:text-[14px]", done && "text-fg-3 line-through")}>{a.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 md:mt-0 md:flex-nowrap">
          <DueBadge a={a} today={today} />
          <SectorChip sector={sectorById(a.sectorId)} />
        </span>
        <span className="md:hidden">
          <FollowUpLine a={a} />
        </span>
      </Link>
    </li>
  );
}

function AgendaList({ events, now }: { events: TodayEvent[]; now: string }) {
  const { sectorById } = useApp();
  const nowIdx = events.findIndex((e) => e.start > now);
  return (
    <ul>
      {events.map((e, i) => (
        <li key={e.id}>
          {i === nowIdx && i > 0 && (
            <div className="relative z-[1] flex h-0 items-center gap-2 px-3.5 font-mono text-[12px] font-bold text-ac-text" aria-label={`Agora ${now}`}>
              <span className="size-2 rounded-full bg-ac" />
              <span className="bg-surface px-1.5">agora {now}</span>
              <span className="h-0.5 flex-1 bg-ac" />
            </div>
          )}
          <div className={cn("grid grid-cols-[58px_1fr] gap-2.5 border-t border-line px-3.5 py-3 md:grid-cols-[52px_1fr]", i === 0 && "border-t-0", e.past && "opacity-55")}>
            <div className="font-mono text-[15px] font-semibold leading-tight md:text-[13px]">
              {e.start}
              <small className="block text-[13px] font-medium text-fg-3 md:text-[12px]">{e.end}</small>
            </div>
            <div className="min-w-0">
              <div className="text-[16px] font-semibold leading-snug md:text-[14px]">{e.title}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <SectorChip sector={sectorById(e.sectorId)} />
                <span className="inline-flex items-center gap-1 text-[14px] text-fg-3 md:text-[13px] [&_svg]:size-3.5">
                  <Icon name={EVENT_TYPE_ICON[e.type]} />
                  {EVENT_TYPE_LABEL[e.type]}
                </span>
                {e.recurring && (
                  <span className="inline-flex items-center gap-1 text-[14px] text-fg-3 md:text-[13px]">
                    <Repeat className="size-3.5" /> recorrente
                  </span>
                )}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PrioritiesSheet({ open, onClose, candidates, current }: { open: boolean; onClose: () => void; candidates: ActionDTO[]; current: ActionDTO[] }) {
  const { today, sectorById } = useApp();
  const [sel, setSel] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    // ao abrir, começa pela seleção atual
    setWasOpen(open);
    if (open) setSel(current.filter((a) => a.status !== "DONE").map((a) => a.id));
  }
  const byId = useMemo(() => new Map([...candidates, ...current].map((a) => [a.id, a])), [candidates, current]);

  const list = useMemo(
    () => [...candidates].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    [candidates],
  );

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 5 ? (toast("Escolha no máximo 5 prioridades."), s) : [...s, id]));
  const move = (i: number, d: -1 | 1) =>
    setSel((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Prioridades do dia"
      description="Escolha até 5 e coloque na ordem em que vai atacar."
      wide
    >
      {sel.length > 0 && (
        <ol className="mb-4 grid gap-1.5">
          {sel.map((id, i) => {
            const a = byId.get(id);
            if (!a) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-[12px] bg-ac-soft py-1 pl-3 pr-1">
                <span className="w-4 font-mono text-[14px] font-bold text-ac-text">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{a.title}</span>
                <button type="button" className="grid size-11 place-items-center rounded-[10px] text-fg-2 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                  <ArrowUp className="size-[18px]" />
                </button>
                <button type="button" className="grid size-11 place-items-center rounded-[10px] text-fg-2 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === sel.length - 1} aria-label="Descer">
                  <ArrowDown className="size-[18px]" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <ul className="-mx-1 max-h-[42dvh] overflow-y-auto">
        {list.map((a) => {
          const on = sel.includes(a.id);
          return (
            <li key={a.id}>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
                <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="size-5 accent-[var(--ac)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug">{a.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <DueBadge a={a} today={today} />
                    <SectorChip sector={sectorById(a.sectorId)} />
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <Button
          block
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setPriorities(sel);
              if (r.ok) {
                toast.success("Prioridades salvas");
                onClose();
              } else toast.error(r.error);
            })
          }
        >
          Salvar prioridades
        </Button>
      </div>
    </Sheet>
  );
}
