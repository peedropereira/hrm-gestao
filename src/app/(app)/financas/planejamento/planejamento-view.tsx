"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, Loader2, Minus, Pencil, PiggyBank, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { Card, PanelHead } from "@/components/ds";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { CatIcon, useFin } from "@/components/fin/fin-ui";
import { ProjectionChart } from "@/components/fin/charts-lazy";
import { archiveGoal, moveGoal, saveGoal } from "@/app/actions/finance";
import { Legend } from "../relatorios/relatorios-view";
import { pct } from "@/lib/fin-report";
import { formatBR } from "@/lib/dates";
import { brl, monthAbbr, monthName, moneyInput, parseMoney, type FinAccountDTO, type FinGoalDTO, type InstallmentPlan, type ProjectionMonth, type ReportTx } from "@/lib/fin-types";
import { cn } from "@/lib/utils";

const inputCls =
  "h-12 w-full min-w-0 rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[14px]";
const lbl = "text-[15px] font-semibold md:text-[13px]";
const COLORS = ["#0e6e7e", "#16a34a", "#2563eb", "#7c3aed", "#ea580c", "#db2777", "#ca8a04", "#475569"];

// Regra 50/30/20: grupos de necessidades, desejos e poupança
const NEEDS = new Set(["Moradia", "Transporte", "Saúde", "Educação", "Família e filhos", "Impostos e taxas", "Dívidas e empréstimos", "Pets"]);
const WANTS_CATS = new Set(["Restaurantes", "Delivery", "Streaming", "Assinaturas e apps"]);
const SAVE = new Set(["Investimentos"]);

type Props = {
  month: string;
  horizon: number;
  accounts: FinAccountDTO[];
  remaining: { income: number; expense: number };
  projection: ProjectionMonth[];
  installments: InstallmentPlan[];
  goals: FinGoalDTO[];
  recent: ReportTx[];
};

function monthsUntil(from: string, to: string) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

export function PlanejamentoView({ month, horizon, accounts, remaining, projection, installments, goals, recent }: Props) {
  const { catById, accById } = useFin();
  const [goalForm, setGoalForm] = useState<Partial<FinGoalDTO> | null>(null);
  const [moving, setMoving] = useState<{ goal: FinGoalDTO; dir: 1 | -1 } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const cash = accounts.filter((a) => !a.archived && a.type !== "CREDIT_CARD").reduce((t, a) => t + a.balance, 0);
  const endOfMonth = cash + remaining.income - remaining.expense;

  // saldo previsto ao fim de cada mês
  const proj = projection.map((p, i) => {
    const balance = endOfMonth + projection.slice(1, i + 1).reduce((t, x) => t + x.income - x.expense, 0);
    return { ...p, label: monthAbbr(p.month), balance: Math.round(balance * 100) / 100, income: i === 0 ? remaining.income : p.income, expense: i === 0 ? remaining.expense : p.expense };
  });
  const firstNegative = proj.find((p) => p.balance < 0);
  const committed = installments.reduce((t, i) => t + i.remaining, 0);

  // 50/30/20 com a média dos últimos 3 meses fechados
  const nMonths = Math.max(1, new Set(recent.map((r) => r.month)).size);
  const incAvg = recent.filter((r) => r.kind === "INCOME").reduce((t, r) => t + r.amount, 0) / nMonths;
  let needs = 0;
  let wants = 0;
  let invest = 0;
  for (const r of recent) {
    if (r.kind !== "EXPENSE") continue;
    const c = catById(r.categoryId);
    if (c && SAVE.has(c.group)) invest += r.amount;
    else if (c && NEEDS.has(c.group)) needs += r.amount;
    else if (c && c.group === "Alimentação" && !WANTS_CATS.has(c.name)) needs += r.amount;
    else if (c && c.group === "Contas e assinaturas" && !WANTS_CATS.has(c.name)) needs += r.amount;
    else wants += r.amount;
  }
  needs /= nMonths;
  wants /= nMonths;
  invest /= nMonths;
  const leftover = Math.max(0, incAvg - needs - wants - invest);
  const saved = invest + leftover;

  const activeGoals = goals.filter((g) => !g.archived);
  const archivedGoals = goals.filter((g) => g.archived);
  const goalsTotal = activeGoals.reduce((t, g) => t + g.saved, 0);
  const router = useRouter();

  return (
    <div className="grid gap-4 px-4 pb-8 md:px-7">
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4 [&>*]:min-w-0">
        <Tile label="Saldo hoje" value={brl(cash)} sub="contas, sem cartões" tone={cash < 0 ? "red" : undefined} />
        <Tile label="A receber no mês" value={brl(remaining.income)} sub="ainda não recebido" tone="green" />
        <Tile label="A pagar no mês" value={brl(remaining.expense)} sub="contas e faturas em aberto" />
        <Tile label={`Previsto em ${monthAbbr(month)}`} value={brl(endOfMonth)} sub="saldo ao fim do mês" tone={endOfMonth < 0 ? "red" : "green"} />
      </div>

      <Card>
        <PanelHead title="Projeção do saldo">
          <div className="flex gap-1">
            {[6, 12].map((h) => (
              <Link key={h} href={`/financas/planejamento?h=${h}`} scroll={false} aria-pressed={horizon === h} className={cn("flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold", horizon === h ? "border-fg bg-fg text-bg" : "border-line text-fg-2")}>
                {h} meses
              </Link>
            ))}
          </div>
        </PanelHead>
        {firstNegative ? (
          <p className="mx-4 mt-3 rounded-[10px] bg-red-bg px-3 py-2 text-[14px] text-red">
            Atenção: o saldo previsto fica negativo em <b>{monthName(firstNegative.month)}</b> ({brl(firstNegative.balance)}).
          </p>
        ) : (
          <p className="mx-4 mt-3 rounded-[10px] bg-green-bg px-3 py-2 text-[14px] text-green">Saldo previsto positivo em todos os {horizon} meses.</p>
        )}
        <div className="px-2 pb-1 pt-3">
          <ProjectionChart data={proj} />
        </div>
        <Legend items={[["var(--green-solid)", "Entradas previstas"], ["var(--ac)", "Saídas previstas"], ["var(--fg)", "Saldo ao fim do mês"]]} />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-max text-[13px] tabular-nums">
            <thead>
              <tr className="bg-surface-2 text-fg-3">
                <th className="px-3.5 py-2 text-left font-semibold">Mês</th>
                <th className="px-3 py-2 text-right font-semibold">Entradas</th>
                <th className="px-3 py-2 text-right font-semibold">Saídas</th>
                <th className="px-3 py-2 text-right font-semibold">Fixos</th>
                <th className="px-3 py-2 text-right font-semibold">Parcelas</th>
                <th className="px-3.5 py-2 text-right font-semibold">Saldo previsto</th>
              </tr>
            </thead>
            <tbody>
              {proj.map((p, i) => (
                <tr key={p.month} className="border-t border-line">
                  <td className="px-3.5 py-2 font-medium">
                    {monthName(p.month)}
                    {i === 0 && <span className="text-fg-3"> · o que falta</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-green">{brl(p.income)}</td>
                  <td className="px-3 py-2 text-right">{brl(p.expense)}</td>
                  <td className="px-3 py-2 text-right text-fg-2">{brl(p.fixed)}</td>
                  <td className="px-3 py-2 text-right text-fg-2">{brl(p.installments)}</td>
                  <td className={cn("px-3.5 py-2 text-right font-semibold", p.balance < 0 ? "text-red" : "")}>{brl(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[13px] text-fg-3">Considera os fixos cadastrados, as parcelas e o que já está lançado. Gastos do dia a dia ainda não lançados não entram na conta.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <PanelHead title="Objetivos" count={activeGoals.length}>
            <Button size="sm" className="h-9 md:h-8" onClick={() => setGoalForm({ color: COLORS[0] })}>
              <Plus /> Novo objetivo
            </Button>
          </PanelHead>
          {activeGoals.length === 0 ? (
            <div className="grid justify-items-center gap-2 px-5 py-8 text-center">
              <Target className="size-8 text-fg-3" />
              <p className="max-w-[340px] text-[15px] text-fg-3">Crie objetivos como reserva de emergência, viagem ou carro novo. O app mostra quanto guardar por mês para chegar lá no prazo.</p>
            </div>
          ) : (
            <>
              <p className="border-b border-line px-4 py-2 text-[13px] text-fg-3">
                Guardado nos objetivos: <b className="text-fg-2">{brl(goalsTotal)}</b>
              </p>
              <ul>
                {activeGoals.map((g) => (
                  <GoalRow key={g.id} g={g} month={month} onEdit={() => setGoalForm(g)} onMove={(dir) => setMoving({ goal: g, dir })} />
                ))}
              </ul>
            </>
          )}
          {archivedGoals.length > 0 && (
            <div className="border-t border-line px-4 py-2">
              <button type="button" className="text-[13px] font-semibold text-ac-text" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Ocultar" : "Ver"} concluídos e arquivados ({archivedGoals.length})
              </button>
              {showArchived && (
                <ul className="mt-1">
                  {archivedGoals.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 py-1.5 text-[14px] text-fg-2">
                      <span className="truncate">
                        {g.name} · {brl(g.saved)} de {brl(g.target)}
                      </span>
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-ac-text"
                        onClick={async () => {
                          const r = await archiveGoal(g.id, false);
                          if (!r.ok) toast.error(r.error);
                          else router.refresh();
                        }}
                      >
                        Reativar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card>
          <PanelHead title="Regra 50/30/20" />
          {incAvg <= 0 ? (
            <p className="px-4 py-5 text-[15px] text-fg-3">Lance suas receitas para ver como sua renda se divide.</p>
          ) : (
            <div className="grid gap-3 px-4 py-4">
              <p className="text-[14px] text-fg-3">Média dos últimos {nMonths} meses, sobre a renda de {brl(incAvg)} por mês. A referência é 50% para necessidades, 30% para desejos e 20% para poupar e investir.</p>
              <Rule label="Necessidades" hint="moradia, mercado, transporte, saúde, educação" value={needs} income={incAvg} target={0.5} color="#2563eb" />
              <Rule label="Desejos" hint="restaurantes, lazer, compras, assinaturas" value={wants} income={incAvg} target={0.3} color="#ea580c" />
              <Rule label="Poupança e investimentos" hint="aportes e o que sobrou" value={saved} income={incAvg} target={0.2} color="#16a34a" atLeast />
            </div>
          )}
        </Card>
      </div>

      <Card>
        <PanelHead title="Parcelamentos em andamento" count={installments.length}>
          <span className="text-[14px] font-semibold tabular-nums md:text-[13px]">{brl(committed)} a pagar</span>
        </PanelHead>
        {installments.length === 0 ? (
          <p className="px-4 py-5 text-[15px] text-fg-3">Nenhuma compra parcelada em aberto.</p>
        ) : (
          <ul className="grid md:grid-cols-2">
            {installments.map((p) => {
              const c = catById(p.categoryId);
              const left = p.count - p.done;
              return (
                <li key={p.group} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 border-t border-line px-3.5 py-2.5 md:[&:nth-child(2)]:border-t-0 first:border-t-0 md:odd:border-r">
                  <CatIcon cat={c} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium md:text-[14px]">{p.description}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="relative block h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-ac" style={{ width: `${(p.done / Math.max(1, p.count)) * 100}%` }} />
                      </span>
                      <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">
                        {p.done}/{p.count}
                      </span>
                    </span>
                    <span className="text-[12px] text-fg-3">
                      {brl(p.perMonth)}/mês · {left} {left === 1 ? "parcela" : "parcelas"} · termina {monthAbbr(p.lastMonth)}
                      {accById(p.accountId) ? ` · ${accById(p.accountId)!.name}` : ""}
                    </span>
                  </span>
                  <b className="text-right tabular-nums">{brl(p.remaining)}</b>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {goalForm && <GoalForm initial={goalForm} onClose={() => setGoalForm(null)} />}
      {moving && <MoveForm goal={moving.goal} dir={moving.dir} onClose={() => setMoving(null)} />}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <Card className="grid min-w-0 gap-0.5 px-3.5 py-3 sm:px-4 sm:py-3.5">
      <span className="truncate text-[14px] font-medium text-fg-3 md:text-[13px]">{label}</span>
      <b className={cn("truncate text-[19px] font-bold leading-tight tracking-[-0.02em] tabular-nums sm:text-[22px]", tone === "green" && "text-green", tone === "red" && "text-red")}>{value}</b>
      {sub && <span className="truncate text-[13px] text-fg-3">{sub}</span>}
    </Card>
  );
}

function Rule({ label, hint, value, income, target, color, atLeast }: { label: string; hint: string; value: number; income: number; target: number; color: string; atLeast?: boolean }) {
  const share = income > 0 ? value / income : 0;
  const ok = atLeast ? share >= target : share <= target + 0.02;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <b className="text-[15px] md:text-[14px]">{label}</b> <span className="text-[13px] text-fg-3">· {hint}</span>
        </span>
        <span className={cn("shrink-0 text-[14px] font-semibold tabular-nums", ok ? "text-green" : "text-red")}>{pct(share)}</span>
      </div>
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: color }} />
        <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${target * 100}%` }} title={`meta ${target * 100}%`} />
      </div>
      <span className="text-[12px] text-fg-3">
        {brl(value)}/mês · meta {atLeast ? "mínima" : "máxima"} {Math.round(target * 100)}% ({brl(income * target)})
      </span>
    </div>
  );
}

function GoalRow({ g, month, onEdit, onMove }: { g: FinGoalDTO; month: string; onEdit: () => void; onMove: (dir: 1 | -1) => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = g.saved >= g.target;
  const share = g.target ? Math.min(1, g.saved / g.target) : 0;
  const missing = Math.max(0, g.target - g.saved);
  const left = g.deadline ? Math.max(1, monthsUntil(month, g.deadline.slice(0, 7)) + 1) : null;
  const perMonth = left ? missing / left : null;
  const late = g.deadline && g.deadline.slice(0, 7) < month && !done;
  return (
    <li className="border-t border-line px-3.5 py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${g.color} ${share * 360}deg, var(--surface-2) 0)` }}>
          <span className="grid size-[30px] place-items-center rounded-full bg-surface" style={{ color: g.color }}>
            <PiggyBank className="size-4" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <b className="truncate text-[15px] md:text-[14px]">{g.name}</b>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: g.color }}>
              {Math.round(share * 100)}%
            </span>
          </span>
          <span className="block text-[13px] text-fg-3 tabular-nums">
            {brl(g.saved)} de {brl(g.target)}
            {g.deadline && ` · até ${formatBR(g.deadline)}`}
          </span>
        </span>
      </div>
      <p className={cn("mt-1.5 flex items-center gap-1.5 text-[13px]", done ? "text-green" : late ? "text-red" : "text-fg-2")}>
        <CalendarClock className="size-3.5 shrink-0" />
        {done ? "Objetivo alcançado!" : late ? `Prazo passou · faltam ${brl(missing)}` : perMonth !== null ? `Guarde ${brl(perMonth)} por mês para chegar no prazo (${left} ${left === 1 ? "mês" : "meses"})` : `Faltam ${brl(missing)} · defina um prazo para ver quanto guardar por mês`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" className="h-9 md:h-8" onClick={() => onMove(1)}>
          <Plus /> Guardar
        </Button>
        <Button size="sm" variant="secondary" className="h-9 md:h-8" onClick={() => onMove(-1)} disabled={g.saved <= 0}>
          <Minus /> Retirar
        </Button>
        <Button size="sm" variant="ghost" className="h-9 md:h-8" onClick={onEdit}>
          <Pencil /> Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 md:h-8"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await archiveGoal(g.id);
              if (!r.ok) return void toast.error(r.error);
              toast.success(done ? "Objetivo concluído e arquivado." : "Objetivo arquivado.");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Archive />} {done ? "Concluir" : "Arquivar"}
        </Button>
      </div>
      {g.entries.length > 0 && (
        <p className="mt-1.5 text-[12px] text-fg-3">
          Último movimento: {g.entries[0].amount > 0 ? "guardou" : "retirou"} {brl(Math.abs(g.entries[0].amount))} em {formatBR(g.entries[0].date)}
        </p>
      )}
    </li>
  );
}

function GoalForm({ initial, onClose }: { initial: Partial<FinGoalDTO>; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: initial.name ?? "", target: moneyInput(initial.target), deadline: initial.deadline ?? "", color: initial.color ?? COLORS[0], notes: initial.notes ?? "" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const presets = ["Reserva de emergência", "Viagem", "Carro", "Casa própria", "Aposentadoria"];
  const submit = () =>
    start(async () => {
      const target = parseMoney(f.target);
      if (!target) return void toast.error("Informe o valor do objetivo.");
      const r = await saveGoal({ name: f.name, target, deadline: f.deadline || null, color: f.color, notes: f.notes || null }, initial.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(initial.id ? "Objetivo atualizado." : "Objetivo criado.");
      router.refresh();
      onClose();
    });
  return (
    <Sheet open onClose={onClose} title={initial.id ? `Editar ${initial.name}` : "Novo objetivo"}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor="goal-name" className={lbl}>
            Nome
          </label>
          <input id="goal-name" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="ex.: Reserva de emergência" required data-autofocus />
          {!initial.id && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => set("name", p)} className="h-8 rounded-full border border-line px-3 text-[13px] font-medium text-fg-2 hover:border-line-strong">
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="goal-target" className={lbl}>
              Valor (R$)
            </label>
            <input id="goal-target" inputMode="decimal" className={inputCls} value={f.target} onChange={(e) => set("target", e.target.value)} placeholder="20.000,00" required />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="goal-deadline" className={lbl}>
              Prazo
            </label>
            <input id="goal-deadline" type="date" className={inputCls} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className={lbl}>Cor</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={f.color === c} onClick={() => set("color", c)} className={cn("size-9 rounded-full border-2", f.color === c ? "border-fg" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="goal-notes" className={lbl}>
            Observações
          </label>
          <input id="goal-notes" className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="opcional (ex.: onde está aplicado)" />
        </div>
        <Button type="submit" block disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Salvar objetivo
        </Button>
      </form>
    </Sheet>
  );
}

function MoveForm({ goal, dir, onClose }: { goal: FinGoalDTO; dir: 1 | -1; onClose: () => void }) {
  const { today } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const missing = Math.max(0, goal.target - goal.saved);
  return (
    <Sheet open onClose={onClose} title={dir > 0 ? `Guardar em ${goal.name}` : `Retirar de ${goal.name}`} description={`${brl(goal.saved)} guardados de ${brl(goal.target)}`}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseMoney(value);
          if (!v) return void toast.error("Informe o valor.");
          start(async () => {
            const r = await moveGoal(goal.id, v * dir, date);
            if (!r.ok) return void toast.error(r.error);
            toast.success(dir > 0 ? `${brl(v)} guardados em ${goal.name}.` : `${brl(v)} retirados de ${goal.name}.`);
            router.refresh();
            onClose();
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="mv-value" className={lbl}>
              Valor (R$)
            </label>
            <input id="mv-value" inputMode="decimal" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} required data-autofocus />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="mv-date" className={lbl}>
              Data
            </label>
            <input id="mv-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {dir > 0 && missing > 0 && (
          <button type="button" className="justify-self-start text-[13px] font-semibold text-ac-text" onClick={() => setValue(moneyInput(missing))}>
            Completar o objetivo ({brl(missing)})
          </button>
        )}
        <p className="text-[13px] text-fg-3">Isto só registra o quanto está separado para o objetivo. Para tirar o valor de uma conta, lance também uma transferência para a conta de investimentos.</p>
        <Button type="submit" block disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} {dir > 0 ? "Guardar" : "Retirar"}
        </Button>
      </form>
    </Sheet>
  );
}
