"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, MessageCircle, Pencil, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { CheckButton, FollowUpLine, SwipeCard } from "@/components/action-bits";
import { Badge, Card, DueBadge, EmptyState, HealthLabel, KindLabel, PanelHead, PersonChip, SectorTile, Spark, initials } from "@/components/ds";
import { Button } from "@/components/button";
import { deleteDemand, deleteNeed, deleteNote, deletePerson } from "@/app/actions/sectors";
import { formatBR, formatShort } from "@/lib/dates";
import { DEMAND_STATUS_LABEL, NEED_CATEGORY_LABEL, NEED_STATUS_LABEL, NEED_STATUS_TONE, PRIORITY_LABEL, formatBRL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionDTO, PersonDTO, SectorDTO, SectorHealth } from "@/lib/types";
import type { KpiSnapshot } from "@/lib/data";
import { DemandForm, NeedForm, NoteForm, PersonForm, SectorForm, type DemandRow, type NeedRow } from "../sector-forms";

type Props = {
  sector: SectorDTO;
  subIds: string[];
  tab: string;
  health: SectorHealth | null;
  actions: ActionDTO[];
  kpis: KpiSnapshot[];
  needs: NeedRow[];
  demands: DemandRow[];
  notes: { id: string; content: string; createdAt: string }[];
  timeline: { id: string; summary: string; at: string }[];
};

const digits = (s: string) => s.replace(/\D/g, "");
const waLink = (s: string) => {
  const d = digits(s);
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
};

function kpiStatus(k: KpiSnapshot, redPct = 10): "red" | "amber" | "green" {
  if (k.offPct > redPct) return "red";
  if (k.offPct > 0) return "amber";
  return "green";
}
const KPI_COLOR = { red: "var(--red-solid)", amber: "var(--amber-solid)", green: "var(--green-solid)" };
const KPI_TEXT = { red: "text-red", amber: "text-amber", green: "text-green" };
const fmtVal = (v: number | null, unit: string) =>
  v === null ? "—" : unit === "R$" ? formatBRL(v).replace(",00", "") : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const unitSuffix = (u: string) => (u === "R$" ? "" : u === "%" ? "%" : ` ${u}`);

export function SectorView(p: Props) {
  const { people, sectors, today, applyOverlay, openCapture } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [editSector, setEditSector] = useState(false);
  const [form, setForm] = useState<null | { kind: "need"; row?: NeedRow } | { kind: "demand"; row?: DemandRow } | { kind: "note"; row?: { id: string; content: string } } | { kind: "person"; row?: PersonDTO }>(null);

  const s = p.sector;
  const team = people.filter((x) => x.sectorId && p.subIds.includes(x.sectorId));
  const leader = team.find((x) => x.isLeader && x.sectorId === s.id) ?? team.find((x) => x.isLeader);
  const subs = sectors.filter((x) => x.parentId === s.id);
  const actions = applyOverlay(p.actions).filter((a) => a.status !== "DONE");
  const overdue = actions.filter((a) => a.dueDate && a.dueDate < today);
  const pendingNeeds = p.needs.filter((n) => n.status === "RAISED" || n.status === "ANALYSIS");
  const oneOff = pendingNeeds.filter((n) => !n.recurring).reduce((t, n) => t + (n.estimatedCost ?? 0), 0);
  const monthly = pendingNeeds.filter((n) => n.recurring).reduce((t, n) => t + (n.estimatedCost ?? 0), 0);
  const openDemands = p.demands.filter((d) => d.status === "OPEN" || d.status === "IN_PROGRESS");

  const tabs = [
    ["resumo", "Resumo", null],
    ["acoes", "Ações", actions.length],
    ["metas", "Metas", p.kpis.length],
    ["necessidades", "Necessidades", pendingNeeds.length],
    ["demandas", "Demandas", openDemands.length],
    ["notas", "Notas", p.notes.length],
    ["pessoas", "Pessoas", team.length],
  ] as const;

  const setTab = (t: string) => router.replace(t === "resumo" ? path : `${path}?aba=${t}`, { scroll: false });

  const undoable = (fn: (restore?: boolean) => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    void fn().then((r) => {
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg, { action: { label: "Desfazer", onClick: () => void fn(true) } });
    });

  const newAction = () => openCapture(`#${s.slug} `);

  // ---- blocos reutilizados ----
  const kpiBlock = (limit?: number) =>
    p.kpis.length === 0 ? (
      <p className="px-4 py-5 text-[15px] text-fg-3">Nenhuma meta cadastrada. O cadastro e lançamento de metas chega na Fase 3.</p>
    ) : (
      <ul>
        {p.kpis.slice(0, limit).map((k) => {
          const st = kpiStatus(k);
          const alvo = k.direction === "LOWER_BETTER" ? "≤" : "≥";
          return (
            <li key={k.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-line px-3.5 py-3 first:border-t-0 md:px-4">
              <span className="text-[15px] font-medium text-fg-2 md:text-[13px]">{k.name}</span>
              <Spark values={k.series} color={KPI_COLOR[st]} width={96} height={40} className="row-span-3" />
              <span className={cn("text-[28px] font-bold leading-tight tracking-[-0.03em] md:text-[24px]", KPI_TEXT[st])}>
                {fmtVal(k.value, k.unit)}
                <small className="ml-0.5 text-[15px] font-semibold tracking-normal text-fg-3">{unitSuffix(k.unit)}</small>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[14px] text-fg-3 md:text-[12px]">
                meta {alvo} {fmtVal(k.target, k.unit)}
                {unitSuffix(k.unit)}
                <HealthLabel status={st} className="text-[13px]">
                  {st === "red" ? "Fora do alvo" : st === "amber" ? "Perto do limite" : "No alvo"}
                </HealthLabel>
              </span>
            </li>
          );
        })}
      </ul>
    );

  const actionRows = (list: ActionDTO[]) =>
    list.length === 0 ? (
      <p className="px-4 py-5 text-[15px] text-fg-3">Nenhuma ação aberta neste setor.</p>
    ) : (
      <ul>
        {list.map((a) => (
          <li key={a.id} className="flex items-start gap-1 border-t border-line py-1.5 pl-1 pr-3.5 first:border-t-0 md:items-center md:py-0.5">
            <CheckButton a={a} />
            <Link href={`/acoes/${a.id}`} className="min-w-0 flex-1 py-2 md:flex md:items-center md:gap-3">
              <span className="block text-[16px] font-medium leading-snug md:flex-1 md:truncate md:text-[14px]">{a.title}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 md:mt-0 md:flex-nowrap">
                <DueBadge a={a} today={today} />
                <PersonChip person={people.find((x) => x.id === a.assigneeId)} />
                <KindLabel kind={a.kind} className="max-md:hidden" />
              </span>
              <span className="md:hidden">
                <FollowUpLine a={a} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );

  const needRows = (list: NeedRow[], editable: boolean) =>
    list.length === 0 ? (
      <p className="px-4 py-5 text-[15px] text-fg-3">Nenhuma necessidade registrada.</p>
    ) : (
      <ul>
        {list.map((n) => (
          <li key={n.id} className="grid gap-1 border-t border-line px-3.5 py-3 first:border-t-0 md:px-4">
            <div className="flex items-start justify-between gap-3">
              <b className="text-[16px] font-semibold leading-snug md:text-[14px]">{n.title}</b>
              <span className="whitespace-nowrap font-mono text-[15px] font-semibold md:text-[13px]">
                {n.estimatedCost != null ? `${formatBRL(n.estimatedCost)}${n.recurring ? "/mês" : ""}` : "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={NEED_STATUS_TONE[n.status]}>{NEED_STATUS_LABEL[n.status]}</Badge>
              <span className="text-[14px] text-fg-3 md:text-[13px]">
                {NEED_CATEGORY_LABEL[n.category]} · prioridade {PRIORITY_LABEL[n.priority].toLowerCase()}
              </span>
              {editable && (
                <span className="ml-auto flex gap-1">
                  <button type="button" className="grid size-10 place-items-center rounded-[8px] text-fg-3 hover:bg-surface-2" aria-label={`Editar ${n.title}`} onClick={() => setForm({ kind: "need", row: n })}>
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" className="grid size-10 place-items-center rounded-[8px] text-fg-3 hover:bg-surface-2" aria-label={`Excluir ${n.title}`} onClick={() => undoable((r) => deleteNeed(n.id, r), "Necessidade excluída")}>
                    <Trash2 className="size-4" />
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    );

  const demandRows = (list: DemandRow[], editable: boolean) =>
    list.length === 0 ? (
      <p className="px-4 py-5 text-[15px] text-fg-3">Nenhuma demanda registrada.</p>
    ) : (
      <ul>
        {list.map((d) => {
          const late = d.dueDate && d.dueDate < today && (d.status === "OPEN" || d.status === "IN_PROGRESS");
          return (
            <li key={d.id} className="grid gap-1 border-t border-line px-3.5 py-3 first:border-t-0 md:px-4">
              <div className="flex items-start justify-between gap-3">
                <b className="text-[16px] font-semibold leading-snug md:text-[14px]">{d.title}</b>
                {d.dueDate && <Badge tone={late ? "red" : d.dueDate === today ? "amber" : "neutral"}>{formatShort(d.dueDate)}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[14px] text-fg-3 md:text-[13px]">
                <span>
                  {d.source ?? "Origem não informada"} · entrou {formatBR(d.receivedAt)} · {PRIORITY_LABEL[d.priority]}
                </span>
                <Badge tone={d.status === "IN_PROGRESS" ? "blue" : d.status === "DONE" ? "green" : "neutral"}>{DEMAND_STATUS_LABEL[d.status]}</Badge>
                {editable && (
                  <span className="ml-auto flex gap-1">
                    <button type="button" className="grid size-10 place-items-center rounded-[8px] hover:bg-surface-2" aria-label={`Editar ${d.title}`} onClick={() => setForm({ kind: "demand", row: d })}>
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" className="grid size-10 place-items-center rounded-[8px] hover:bg-surface-2" aria-label={`Excluir ${d.title}`} onClick={() => undoable((r) => deleteDemand(d.id, r), "Demanda excluída")}>
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );

  const timeline = (
    <ul className="px-4 pb-1 pt-3.5">
      {p.timeline.length === 0 && <li className="pb-3 text-[15px] text-fg-3">Sem movimentações ainda.</li>}
      {p.timeline.map((t, i) => (
        <li key={t.id} className="relative grid grid-cols-[12px_1fr] gap-2.5 pb-3.5 text-[14px] text-fg-2 md:text-[13px]">
          <span className="ml-0.5 mt-1.5 size-2 rounded-full bg-line-strong" />
          {i < p.timeline.length - 1 && <span className="absolute bottom-0 left-[5.5px] top-[18px] w-px bg-line" />}
          <div>
            <time className="block font-mono text-[12px] text-fg-3">{t.at}</time>
            {t.summary}
          </div>
        </li>
      ))}
    </ul>
  );

  const addBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="tap inline-flex items-center gap-1 text-[15px] font-semibold text-ac-text md:min-h-0 md:text-[13px]">
      <Plus className="size-4" /> {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Topo */}
      <div className="flex items-center justify-between px-1.5 pt-1 md:hidden">
        <Link href="/setores" className="inline-flex h-11 items-center gap-0.5 px-2 text-[17px] font-medium text-ac-text">
          <ChevronLeft className="size-[22px]" /> Setores
        </Link>
        <button type="button" onClick={() => setEditSector(true)} className="tap grid place-items-center rounded-[12px] text-fg-2" aria-label="Editar setor">
          <Pencil className="size-5" />
        </button>
      </div>
      <header className="md:flex md:items-center md:gap-5 md:border-b md:border-line md:bg-surface md:px-7 md:py-5">
        <div className="flex items-center gap-3.5 px-5 pb-3.5 pt-2 md:p-0">
          <SectorTile sector={s} size={56} />
          <div>
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">{s.name}</h1>
            {p.health && (
              <HealthLabel status={p.health.status} className="mt-1 items-start whitespace-normal leading-snug [&>span]:mt-[5px]">
                {p.health.status === "green" ? "Em dia" : `${p.health.status === "red" ? "Crítico" : "Atenção"} · ${p.health.reason}`}
              </HealthLabel>
            )}
            {subs.length > 0 && <p className="mt-0.5 text-[14px] text-fg-3">Subsetores: {subs.map((x) => x.name).join(", ")}</p>}
          </div>
        </div>
        {/* Líder */}
        <div className="mx-4 grid gap-3 rounded-[14px] border border-line bg-surface p-3.5 shadow-card md:mx-0 md:ml-auto md:flex md:items-center md:gap-3 md:rounded-none md:border-0 md:border-l md:p-0 md:pl-5 md:shadow-none">
          {leader ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-[15px] font-bold text-fg-2 md:size-9 md:text-[13px]">{initials(leader.name)}</span>
                <div>
                  <b className="block whitespace-nowrap text-[17px] md:text-[14px]">{leader.name}</b>
                  <span className="text-[14px] text-fg-3 md:whitespace-nowrap md:text-[12px]">
                    {leader.role ?? "Líder"}
                    {leader.phone ? ` · ${leader.phone}` : ""}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex">
                {leader.phone && (
                  <a href={`tel:${digits(leader.phone)}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-line-strong bg-surface text-[16px] font-semibold md:h-9 md:px-3 md:text-[13px]">
                    <Phone className="size-[18px] md:size-4" /> Ligar
                  </a>
                )}
                {(leader.whatsapp || leader.phone) && (
                  <a href={waLink(leader.whatsapp || leader.phone!)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-line-strong bg-surface text-[16px] font-semibold md:h-9 md:px-3 md:text-[13px]">
                    <MessageCircle className="size-[18px] md:size-4" /> WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setForm({ kind: "person" })}>
              <UserPlus /> Cadastrar líder
            </Button>
          )}
        </div>
      </header>

      {/* Abas */}
      <nav className="no-scrollbar mt-3.5 flex gap-0.5 overflow-x-auto border-b border-line px-3 md:mt-0 md:bg-surface md:px-5" aria-label="Seções do setor">
        {tabs.map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-current={p.tab === k ? "page" : undefined}
            className={cn("inline-flex h-[46px] shrink-0 items-center gap-1.5 border-b-[2.5px] px-2.5 text-[15px] font-semibold md:h-10 md:text-[13px]", p.tab === k ? "border-ac text-fg" : "border-transparent text-fg-3")}
          >
            {l}
            {n !== null && <span className="font-mono text-[12px] font-medium">{n}</span>}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-2 pl-4 md:flex">
          <Button size="sm" variant="secondary" onClick={() => setEditSector(true)}>
            <Pencil /> Editar
          </Button>
          <Button size="sm" onClick={newAction}>
            <Plus /> Nova ação
          </Button>
        </span>
      </nav>

      <div className="px-4 pt-5 md:px-7">
        {p.tab === "resumo" && (
          <div className="grid gap-5 md:gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 content-start gap-5 md:gap-4 [&>*]:min-w-0">
              <Card>
                <PanelHead title="Metas" count={p.kpis.length}>
                  <button type="button" onClick={() => setTab("metas")} className="text-[14px] font-semibold text-ac-text md:text-[13px]">
                    Ver todas
                  </button>
                </PanelHead>
                {kpiBlock(3)}
              </Card>
              <Card>
                <PanelHead title="Suas ações aqui" count={actions.length}>
                  {addBtn("Nova", newAction)}
                </PanelHead>
                {actionRows(actions.slice(0, 6))}
              </Card>
            </div>
            <div className="grid min-w-0 content-start gap-5 md:gap-4 [&>*]:min-w-0">
              <Card>
                <PanelHead title="Necessidades pendentes" count={pendingNeeds.length}>
                  {addBtn("Nova", () => setForm({ kind: "need" }))}
                </PanelHead>
                {needRows(pendingNeeds.slice(0, 4), false)}
                {pendingNeeds.length > 0 && (
                  <div className="flex items-baseline justify-between gap-3 bg-surface-2 px-4 py-2.5 text-[14px] text-fg-2 md:text-[13px]">
                    Pendente de decisão
                    <b className="text-right font-mono text-fg">
                      {formatBRL(oneOff)}
                      {monthly > 0 && ` + ${formatBRL(monthly)}/mês`}
                    </b>
                  </div>
                )}
              </Card>
              <Card>
                <PanelHead title="Demandas abertas" count={openDemands.length}>
                  {addBtn("Nova", () => setForm({ kind: "demand" }))}
                </PanelHead>
                {demandRows(openDemands.slice(0, 4), false)}
              </Card>
              <Card>
                <PanelHead title="Linha do tempo" />
                {timeline}
              </Card>
            </div>
          </div>
        )}

        {p.tab === "acoes" && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[15px] text-fg-3 md:text-[14px]">
                {actions.length} abertas · {overdue.length} atrasadas
              </p>
              <Button size="sm" onClick={newAction}>
                <Plus /> Nova ação
              </Button>
            </div>
            <div className="-mx-4 md:hidden">
              {actions.length === 0 ? <EmptyState title="Nenhuma ação aberta" className="mx-4">Toque em + para criar.</EmptyState> : actions.map((a) => <SwipeCard key={a.id} a={a} href={`/acoes/${a.id}`} />)}
            </div>
            <Card className="hidden md:block">{actionRows(actions)}</Card>
          </>
        )}

        {p.tab === "metas" && (
          <Card>
            <PanelHead title="Metas e indicadores" count={p.kpis.length}>
              <span className="text-[13px] text-fg-3">Lançamento mensal e gráficos completos na Fase 3</span>
            </PanelHead>
            {kpiBlock()}
          </Card>
        )}

        {p.tab === "necessidades" && (
          <Card>
            <PanelHead title="Necessidades" count={p.needs.length}>
              {addBtn("Nova necessidade", () => setForm({ kind: "need" }))}
            </PanelHead>
            {needRows(p.needs, true)}
            {pendingNeeds.length > 0 && (
              <div className="flex items-baseline justify-between gap-3 bg-surface-2 px-4 py-2.5 text-[14px] text-fg-2">
                Pendente de decisão
                <b className="text-right font-mono text-fg">
                  {formatBRL(oneOff)}
                  {monthly > 0 && ` + ${formatBRL(monthly)}/mês`}
                </b>
              </div>
            )}
          </Card>
        )}

        {p.tab === "demandas" && (
          <Card>
            <PanelHead title="Demandas" count={p.demands.length}>
              {addBtn("Nova demanda", () => setForm({ kind: "demand" }))}
            </PanelHead>
            {demandRows(p.demands, true)}
          </Card>
        )}

        {p.tab === "notas" && (
          <Card>
            <PanelHead title="Notas" count={p.notes.length}>
              {addBtn("Nova nota", () => setForm({ kind: "note" }))}
            </PanelHead>
            {p.notes.length === 0 ? (
              <p className="px-4 py-5 text-[15px] text-fg-3">Nenhuma nota ainda.</p>
            ) : (
              <ul>
                {p.notes.map((n) => (
                  <li key={n.id} className="border-t border-line px-4 py-3 first:border-t-0">
                    <p className="whitespace-pre-wrap text-[16px] leading-relaxed md:text-[14px]">{n.content}</p>
                    <div className="mt-1 flex items-center gap-1 text-[12px] text-fg-3">
                      <time className="font-mono">{n.createdAt}</time>
                      <button type="button" className="ml-auto grid size-10 place-items-center rounded-[8px] hover:bg-surface-2" aria-label="Editar nota" onClick={() => setForm({ kind: "note", row: n })}>
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" className="grid size-10 place-items-center rounded-[8px] hover:bg-surface-2" aria-label="Excluir nota" onClick={() => undoable((r) => deleteNote(n.id, r), "Nota excluída")}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {p.tab === "pessoas" && (
          <Card>
            <PanelHead title="Pessoas e contatos" count={team.length}>
              {addBtn("Nova pessoa", () => setForm({ kind: "person" }))}
            </PanelHead>
            {team.length === 0 ? (
              <p className="px-4 py-5 text-[15px] text-fg-3">Ninguém cadastrado. Cadastre o líder e quem você costuma cobrar.</p>
            ) : (
              <ul>
                {team.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-[13px] font-bold text-fg-2">{initials(x.name)}</span>
                    <div className="min-w-0 flex-1">
                      <b className="block text-[16px] md:text-[14px]">
                        {x.name} {x.isLeader && <Badge tone="accent" className="ml-1 align-middle">Líder</Badge>}
                      </b>
                      <span className="text-[14px] text-fg-3 md:text-[13px]">{[x.role, x.phone, x.email].filter(Boolean).join(" · ")}</span>
                    </div>
                    <div className="flex gap-1">
                      {x.phone && (
                        <a href={`tel:${digits(x.phone)}`} className="grid size-11 place-items-center rounded-[10px] border border-line" aria-label={`Ligar para ${x.name}`}>
                          <Phone className="size-[18px]" />
                        </a>
                      )}
                      {(x.whatsapp || x.phone) && (
                        <a href={waLink(x.whatsapp || x.phone!)} target="_blank" rel="noreferrer" className="grid size-11 place-items-center rounded-[10px] border border-line" aria-label={`WhatsApp de ${x.name}`}>
                          <MessageCircle className="size-[18px]" />
                        </a>
                      )}
                      <button type="button" className="grid size-11 place-items-center rounded-[10px] text-fg-3 hover:bg-surface-2" aria-label={`Editar ${x.name}`} onClick={() => setForm({ kind: "person", row: x })}>
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="grid size-11 place-items-center rounded-[10px] text-fg-3 hover:bg-surface-2"
                        aria-label={`Remover ${x.name}`}
                        onClick={() => void deletePerson(x.id).then((r) => (r.ok ? toast.success("Pessoa removida") : toast.error(r.error)))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {editSector && <SectorForm sector={s} open={editSector} onClose={() => setEditSector(false)} />}
      {form?.kind === "need" && <NeedForm need={form.row} sectorId={s.id} open onClose={() => setForm(null)} />}
      {form?.kind === "demand" && <DemandForm demand={form.row} sectorId={s.id} open onClose={() => setForm(null)} />}
      {form?.kind === "note" && <NoteForm note={form.row} sectorId={s.id} open onClose={() => setForm(null)} />}
      {form?.kind === "person" && <PersonForm person={form.row} sectorId={s.id} open onClose={() => setForm(null)} />}
    </div>
  );
}
