"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Grid2x2, List, Plus, Search } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { CheckButton, SwipeCard, SwipeHint, useFollowUp } from "@/components/action-bits";
import { DueBadge, EmptyState, KindLabel, PersonChip, SectorChip } from "@/components/ds";
import { Button } from "@/components/button";
import { QUADRANT_DESC, QUADRANT_LABEL, STATUS_LABEL, quadrant } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionDTO } from "@/lib/types";
import { ActionDetail } from "./action-detail";

const FILTERS = [
  ["todas", "Todas"],
  ["hoje", "Hoje"],
  ["atrasadas", "Atrasadas"],
  ["delegadas", "Delegadas"],
  ["setor", "Por setor"],
  ["concluidas", "Concluídas"],
] as const;

/** Tela larga (>= 1536 px): mostra colunas Tipo e Prioridade na tabela. */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1536px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1536px)").matches,
    () => false,
  );
}

type Group = { key: string; title: string; items: ActionDTO[]; tone?: "red" };

const EMPTY: Record<string, [string, string]> = {
  hoje: ["Nada vence hoje", "Bom momento para revisar as delegadas."],
  atrasadas: ["Nenhuma ação atrasada 👏", "Toque em + para capturar algo novo."],
  delegadas: ["Ninguém te devendo retorno", "Ações delegadas e cobranças aparecem aqui."],
  concluidas: ["Nada concluído nos últimos 14 dias", "As ações concluídas aparecem aqui."],
  todas: ["Tudo em dia", "Toque em + para capturar algo novo."],
  setor: ["Tudo em dia", "Toque em + para capturar algo novo."],
};

export function ActionsView({ open, recentDone, filter, view, selected }: { open: ActionDTO[]; recentDone: ActionDTO[]; filter: string; view: string; selected?: string }) {
  const { today, applyOverlay, sectorById, openCapture, setSearchOpen } = useApp();
  const router = useRouter();
  const wide = useWide();
  const path = usePathname();
  const sp = useSearchParams();

  const all = applyOverlay([...open, ...recentDone]);
  const openNow = all.filter((a) => a.status !== "DONE" && a.status !== "CANCELED");
  const overdue = openNow.filter((a) => a.dueDate && a.dueDate < today);
  const dueToday = openNow.filter((a) => a.dueDate === today);
  const delegated = openNow.filter((a) => a.assigneeId);

  const counts: Record<string, number> = { todas: openNow.length, hoje: dueToday.length, atrasadas: overdue.length, delegadas: delegated.length };

  const groups: Group[] = useMemo(() => {
    const later = openNow.filter((a) => !a.dueDate || a.dueDate > today);
    switch (filter) {
      case "hoje":
        return [{ key: "h", title: "Vencem hoje", items: dueToday }];
      case "atrasadas":
        return [{ key: "a", title: "Atrasadas", items: overdue, tone: "red" }];
      case "delegadas": {
        const since = (a: ActionDTO) => a.lastFollowUpAt ?? a.createdAt.slice(0, 10);
        return [{ key: "d", title: "Aguardando retorno · mais antigas primeiro", items: [...delegated].sort((x, y) => since(x).localeCompare(since(y))) }];
      }
      case "setor": {
        const m = new Map<string, ActionDTO[]>();
        for (const a of openNow) {
          const k = a.sectorId ?? "_";
          m.set(k, [...(m.get(k) ?? []), a]);
        }
        return [...m.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(([k, items]) => ({ key: k, title: k === "_" ? "Sem setor" : (sectorById(k)?.shortName || sectorById(k)?.name || "Setor"), items }));
      }
      case "concluidas":
        return [{ key: "c", title: "Concluídas nos últimos 14 dias", items: all.filter((a) => a.status === "DONE") }];
      default:
        return [
          { key: "a", title: "Atrasadas", items: overdue, tone: "red" as const },
          { key: "h", title: "Hoje", items: dueToday },
          { key: "p", title: "Próximos dias e sem prazo", items: later },
        ];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, all, today]);

  const visible = groups.filter((g) => g.items.length);
  const flat = visible.flatMap((g) => g.items);
  const sel = all.find((a) => a.id === selected) ?? (view === "lista" ? flat[0] : undefined);

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp.toString());
    if (v === null) n.delete(k);
    else n.set(k, v);
    router.replace(`${path}?${n.toString()}`, { scroll: false });
  };

  // Atalhos no desktop: J/K navegam, E conclui.
  const { complete } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || document.querySelector('[role="dialog"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || view !== "lista" || !flat.length) return;
      const i = sel ? flat.findIndex((a) => a.id === sel.id) : -1;
      if (e.key === "j") setParam("sel", flat[Math.min(i + 1, flat.length - 1)].id);
      else if (e.key === "k") setParam("sel", flat[Math.max(i - 1, 0)].id);
      else if (e.key === "e" && sel && sel.status !== "DONE") complete(sel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const emptyMsg = EMPTY[filter] ?? EMPTY.todas;

  return (
    <div className="md:flex md:h-dvh md:flex-col">
      {/* Cabeçalho */}
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 md:px-7 md:pb-3 md:pt-6">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Ações</h1>
          <p className="text-[15px] font-medium text-fg-3 md:text-[14px]">
            {openNow.length} abertas · {overdue.length} atrasadas · {delegated.length} aguardando retorno
          </p>
        </div>
        <div className="flex gap-2 pt-1 md:hidden">
          <button type="button" onClick={() => setSearchOpen(true)} className="grid size-11 place-items-center rounded-[12px] border border-line bg-surface text-fg-2" aria-label="Buscar">
            <Search className="size-5" />
          </button>
        </div>
        <Button size="sm" className="hidden md:inline-flex" onClick={() => openCapture()}>
          <Plus /> Nova ação
          <kbd className="rounded border border-current/40 px-1 font-mono text-[11px] opacity-70">N</kbd>
        </Button>
      </header>

      {/* Filtros e visões */}
      <div className="flex items-center gap-3 md:px-7 md:pb-3">
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto px-4 pb-1.5 pt-1 md:overflow-visible md:p-0">
          {FILTERS.map(([k, l]) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setParam("f", k === "todas" ? null : k)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-semibold md:h-[30px] md:px-3 md:text-[13px]",
                  on ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-2 hover:border-line-strong",
                )}
              >
                {l}
                {counts[k] !== undefined && <span className={cn("font-mono text-[13px] md:text-[12px]", on ? "opacity-70" : "text-fg-3")}>{counts[k]}</span>}
              </button>
            );
          })}
        </div>
        <div className="hidden shrink-0 rounded-[9px] bg-surface-2 p-[3px] md:inline-flex" role="tablist" aria-label="Visão">
          {(
            [
              ["lista", List, "Lista"],
              ["kanban", Columns3, "Kanban"],
              ["matriz", Grid2x2, "Matriz"],
            ] as const
          ).map(([k, I, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              onClick={() => setParam("v", k === "lista" ? null : k)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-semibold text-fg-2", view === k && "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--line)]")}
            >
              <I className="size-[15px]" />
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Celular: cartões deslizáveis */}
      <div className="md:hidden">
        <SwipeHint />
        {visible.length === 0 ? (
          <EmptyState title={emptyMsg[0]} className="mx-4 mt-4">
            {emptyMsg[1]}
          </EmptyState>
        ) : (
          visible.map((g) => (
            <section key={g.key}>
              <h2 className={cn("flex items-center gap-2 px-[22px] pb-2 pt-[18px] text-[13px] font-bold uppercase tracking-[0.06em]", g.tone === "red" ? "text-red" : "text-fg-3")}>
                {g.title}
                <span className="font-mono tracking-normal">{g.items.length}</span>
              </h2>
              {g.items.map((a) => (
                <SwipeCard key={a.id} a={a} href={`/acoes/${a.id}`} />
              ))}
            </section>
          ))
        )}
      </div>

      {/* Desktop */}
      <div className="hidden min-h-0 flex-1 border-t border-line md:flex">
        {view === "lista" && (
          <>
            <div className="min-w-0 flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => openCapture()}
                className="mx-7 my-3 flex h-10 w-[calc(100%-56px)] items-center gap-2.5 rounded-[10px] border border-dashed border-line-strong px-3 text-left text-[14px] text-fg-3 hover:border-ac hover:text-fg-2"
              >
                <Plus className="size-4" />
                <b className="shrink-0 font-semibold text-fg-2">Adicionar ação</b><span className="truncate">· ex.: decidir compra de chapa amanhã #suprimentos !</span>
              </button>
              {visible.length === 0 ? (
                <EmptyState title={emptyMsg[0]} className="mx-7">
                  {emptyMsg[1]}
                </EmptyState>
              ) : (
                <table className="w-full table-fixed border-collapse text-[14px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">
                      <th className="w-[52px] border-y border-line bg-surface-2 py-2 pl-5" />
                      <th className="border-y border-line bg-surface-2 px-2 py-2">Ação</th>
                      <th className="border-y border-line bg-surface-2 px-2 py-2 w-[120px]">Setor</th>
                      <th className="border-y border-line bg-surface-2 px-2 py-2 w-[100px]">Responsável</th>
                      {wide && <th className="w-[92px] border-y border-line bg-surface-2 px-2 py-2">Tipo</th>}
                      <th className="border-y border-line bg-surface-2 px-2 py-2 w-[124px]">Prazo</th>
                      {wide && <th className="w-[116px] border-y border-line bg-surface-2 px-2 py-2">Prioridade</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((g) => (
                      <GroupRows
                        key={g.key}
                        g={g}
                        selId={sel?.id}
                        wide={wide}
                        onSelect={(id) => (window.innerWidth >= 1024 ? setParam("sel", id) : router.push(`/acoes/${id}`))}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {sel && (
              <aside className="hidden w-[380px] shrink-0 overflow-y-auto border-l border-line bg-surface lg:block">
                <ActionDetail key={sel.id} action={sel} compact />
              </aside>
            )}
          </>
        )}
        {view === "kanban" && <Kanban actions={all} />}
        {view === "matriz" && <Matrix actions={openNow} />}
      </div>
    </div>
  );
}

function QuadCell({ a }: { a: ActionDTO }) {
  const q = quadrant(a.urgent, a.important);
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-3" title={QUADRANT_DESC[q]}>
      <span className="grid grid-cols-2 gap-[1.5px]" aria-hidden="true">
        {[0, 1, 2, 3].map((x) => (
          <i key={x} className={cn("size-[5px] rounded-[1px]", x === q ? "bg-fg-2" : "bg-line-strong")} />
        ))}
      </span>
      {QUADRANT_LABEL[q]}
    </span>
  );
}

function GroupRows({ g, selId, onSelect, wide }: { g: Group; selId?: string; onSelect: (id: string) => void; wide: boolean }) {
  const { today, sectorById, personById } = useApp();
  return (
    <>
      <tr>
        <td colSpan={wide ? 7 : 5} className={cn("h-[30px] bg-bg pl-7 text-[11px] font-bold uppercase tracking-[0.06em]", g.tone === "red" ? "text-red" : "text-fg-3")}>
          {g.title} · {g.items.length}
        </td>
      </tr>
      {g.items.map((a) => (
        <tr
          key={a.id}
          onClick={() => onSelect(a.id)}
          className={cn("cursor-pointer [&>td]:h-11 [&>td]:border-b [&>td]:border-line [&>td]:bg-surface [&>td]:px-2", a.id === selId ? "[&>td]:bg-ac-soft" : "hover:[&>td]:bg-surface-2")}
        >
          <td className="!pl-5">
            <CheckButton a={a} size="sm" />
          </td>
          <td className={cn("truncate font-medium", a.status === "DONE" && "text-fg-3 line-through")} title={a.title}>
            <DelegateTitle a={a} />
          </td>
          <td className="truncate">
            <SectorChip sector={sectorById(a.sectorId)} />
          </td>
          <td className="truncate">
            <PersonChip person={personById(a.assigneeId)} />
          </td>
          {wide && (
            <td>
              <KindLabel kind={a.kind} />
            </td>
          )}
          <td>
            <DueBadge a={a} today={today} />
          </td>
          {wide && (
            <td>
              <QuadCell a={a} />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function DelegateTitle({ a }: { a: ActionDTO }) {
  const fu = useFollowUp(a);
  return (
    <>
      {a.title}
      {fu?.late && <span className="ml-2 text-[12px] font-semibold text-amber">· {fu.days}d sem retorno</span>}
    </>
  );
}

function Kanban({ actions }: { actions: ActionDTO[] }) {
  const { today, sectorById, personById } = useApp();
  const cols = ["TODO", "IN_PROGRESS", "WAITING", "DONE"] as const;
  return (
    <div className="grid min-w-0 flex-1 grid-cols-4 gap-3 overflow-y-auto px-7 py-4">
      {cols.map((c) => {
        const items = actions.filter((a) => a.status === c);
        return (
          <div key={c} className="flex min-h-[420px] flex-col gap-2 self-start rounded-[12px] bg-surface-2 p-2.5">
            <h3 className="mx-1 flex justify-between text-[13px] font-semibold">
              {STATUS_LABEL[c]} <span className="font-mono font-medium text-fg-3">{items.length}</span>
            </h3>
            {items.map((a) => (
              <Link key={a.id} href={`/acoes/${a.id}`} className="grid gap-2 rounded-[10px] border border-line bg-surface p-2.5 shadow-card hover:border-line-strong">
                <span className="text-[13px] font-medium leading-snug">{a.title}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <DueBadge a={a} today={today} />
                  <SectorChip sector={sectorById(a.sectorId)} />
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <PersonChip person={personById(a.assigneeId)} />
                  <KindLabel kind={a.kind} />
                </span>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Matrix({ actions }: { actions: ActionDTO[] }) {
  const { today } = useApp();
  return (
    <div className="grid min-w-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-7 py-4">
      {[0, 1, 2, 3].map((q) => {
        const items = actions.filter((a) => quadrant(a.urgent, a.important) === q);
        return (
          <div key={q} className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-[14px] font-semibold">
                {QUADRANT_LABEL[q]} <span className="font-medium text-fg-3">· {QUADRANT_DESC[q]}</span>
              </h3>
              <span className="font-mono text-[13px] text-fg-3">{items.length}</span>
            </div>
            <ul className="py-1">
              {items.length === 0 && <li className="px-4 py-2 text-[13px] text-fg-3">Vazio</li>}
              {items.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-2 text-[13px]">
                  <CheckButton a={a} size="sm" />
                  <Link href={`/acoes/${a.id}`} className="min-w-0 flex-1 truncate py-2 hover:underline">
                    {a.title}
                  </Link>
                  <DueBadge a={a} today={today} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
