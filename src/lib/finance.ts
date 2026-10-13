import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { dateOnlyToISO, todayISO } from "@/lib/dates";
import { EXPENSE_GROUPS, INCOME_GROUPS } from "@/lib/fin-defaults";
import {
  addMonth,
  dayInMonth,
  invoiceMonthOf,
  type FinAccountDTO,
  type FinCategoryDTO,
  type FinInvoiceDTO,
  type FinRecurringDTO,
  type FinTxDTO,
} from "@/lib/fin-types";

const num = (d: unknown) => (d == null ? 0 : Number(d));
export const monthDate = (m: string) => new Date(`${m}-01T00:00:00Z`);
export const isoDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Primeira vez: cria categorias e contas básicas. */
export async function ensureFinanceSetup(ownerId: string) {
  const [cats, accs] = await Promise.all([db.finCategory.count({ where: { ownerId } }), db.finAccount.count({ where: { ownerId } })]);
  if (!cats) {
    const data = [
      ...EXPENSE_GROUPS.flatMap((g, gi) => g.items.map((name, i) => ({ ownerId, name, kind: "EXPENSE" as const, group: g.group, icon: g.icon, color: g.color, order: gi * 100 + i }))),
      ...INCOME_GROUPS.flatMap((g, gi) => g.items.map((name, i) => ({ ownerId, name, kind: "INCOME" as const, group: g.group, icon: g.icon, color: g.color, order: gi * 100 + i }))),
    ];
    await db.finCategory.createMany({ data, skipDuplicates: true });
  }
  if (!accs) {
    await db.finAccount.createMany({
      data: [
        { ownerId, name: "Conta corrente", type: "CHECKING", color: "#0e6e7e", order: 0 },
        { ownerId, name: "Dinheiro", type: "CASH", color: "#15803d", order: 1 },
      ],
    });
  }
}

/** Gera os lançamentos dos fixos nos meses pedidos (sem duplicar). */
export async function ensureRecurring(ownerId: string, months: string[]) {
  const today = todayISO();
  // busca os fixos e o que já foi gerado juntos; só grava quando falta algo
  const [recs, existing] = await Promise.all([
    db.finRecurring.findMany({ where: { ownerId, active: true }, include: { account: true } }),
    db.finTransaction.findMany({ where: { ownerId, recurringMonth: { in: months.map(monthDate) } }, select: { recurringId: true, recurringMonth: true } }),
  ]);
  const done = new Set(existing.map((e) => `${e.recurringId}|${dateOnlyToISO(e.recurringMonth)!.slice(0, 7)}`));
  const data = [];
  for (const r of recs) {
    const start = dateOnlyToISO(r.startMonth)!.slice(0, 7);
    const end = r.endMonth ? dateOnlyToISO(r.endMonth)!.slice(0, 7) : null;
    for (const m of months) {
      if (m < start || (end && m > end) || done.has(`${r.id}|${m}`)) continue;
      const date = dayInMonth(m, r.dayOfMonth);
      const card = r.account?.type === "CREDIT_CARD";
      const pendingCard = !card && r.onCard;
      data.push({
        ownerId,
        kind: r.kind,
        description: r.description,
        amount: r.amount,
        date: isoDate(date),
        paid: !card && !pendingCard && r.autoPaid && date <= today,
        paidAt: !card && !pendingCard && r.autoPaid && date <= today ? isoDate(date) : null,
        cardPending: pendingCard,
        categoryId: r.categoryId,
        accountId: r.accountId,
        recurringId: r.id,
        recurringMonth: monthDate(m),
        invoiceMonth: card ? monthDate(invoiceMonthOf(date, r.account!.closingDay, r.account!.dueDay)) : null,
      });
    }
  }
  if (data.length) await db.finTransaction.createMany({ data, skipDuplicates: true });
}

type TxRow = Awaited<ReturnType<typeof db.finTransaction.findMany>>[number];

export function toTxDTO(t: TxRow): FinTxDTO {
  return {
    id: t.id,
    kind: t.kind,
    description: t.description,
    amount: num(t.amount),
    date: dateOnlyToISO(t.date)!,
    paid: t.paid,
    paidAt: dateOnlyToISO(t.paidAt),
    categoryId: t.categoryId,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    recurringId: t.recurringId,
    installmentNo: t.installmentNo,
    installmentTotal: t.installmentTotal,
    installmentGroup: t.installmentGroup,
    invoiceMonth: t.invoiceMonth ? dateOnlyToISO(t.invoiceMonth)!.slice(0, 7) : null,
    cardPending: t.cardPending,
    notes: t.notes,
  };
}

export const getCategories = cache((ownerId: string) => loadCategories(ownerId));

/** Sem cache da requisição (logo depois de criar as categorias). */
export async function loadCategories(ownerId: string): Promise<FinCategoryDTO[]> {
  const rows = await db.finCategory.findMany({ where: { ownerId }, orderBy: [{ kind: "asc" }, { order: "asc" }, { name: "asc" }] });
  return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind === "INCOME" ? "INCOME" : "EXPENSE", group: c.group, icon: c.icon, color: c.color, budget: c.budget == null ? null : num(c.budget), archived: c.archived }));
}

export async function getRecurring(ownerId: string): Promise<FinRecurringDTO[]> {
  const rows = await db.finRecurring.findMany({ where: { ownerId }, orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "INCOME" ? "INCOME" : "EXPENSE",
    description: r.description,
    amount: num(r.amount),
    categoryId: r.categoryId,
    accountId: r.accountId,
    dayOfMonth: r.dayOfMonth,
    startMonth: dateOnlyToISO(r.startMonth)!.slice(0, 7),
    endMonth: r.endMonth ? dateOnlyToISO(r.endMonth)!.slice(0, 7) : null,
    variable: r.variable,
    autoPaid: r.autoPaid,
    onCard: r.onCard,
    notes: r.notes,
    active: r.active,
  }));
}

/**
 * Contas com saldo e faturas dos cartões.
 * Conta comum: saldo inicial + o que já foi pago/recebido.
 * Cartão: saldo inicial − compras + pagamentos de fatura (negativo = em aberto).
 */
export async function getAccounts(ownerId: string) {
  // somas feitas no banco (não traz todos os lançamentos para o servidor)
  const [accounts, sums, transfersIn] = await Promise.all([
    db.finAccount.findMany({ where: { ownerId }, orderBy: [{ archived: "asc" }, { order: "asc" }, { createdAt: "asc" }] }),
    db.finTransaction.groupBy({
      by: ["accountId", "kind", "paid", "invoiceMonth"],
      where: { ownerId, deletedAt: null, accountId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.finTransaction.groupBy({
      by: ["toAccountId"],
      where: { ownerId, deletedAt: null, kind: "TRANSFER", paid: true, toAccountId: { not: null } },
      _sum: { amount: true },
    }),
  ]);
  const card = new Set(accounts.filter((a) => a.type === "CREDIT_CARD").map((a) => a.id));
  const bal = new Map(accounts.map((a) => [a.id, num(a.initialBalance)]));
  const inv = new Map<string, FinInvoiceDTO>();
  for (const t of sums) {
    const v = num(t._sum.amount);
    if (!t.accountId || !bal.has(t.accountId)) continue;
    const isCard = card.has(t.accountId);
    if (isCard || t.paid) {
      if (t.kind === "INCOME") bal.set(t.accountId, bal.get(t.accountId)! + v);
      else bal.set(t.accountId, bal.get(t.accountId)! - v);
    }
    if (isCard && t.kind !== "TRANSFER" && t.invoiceMonth) {
      const m = dateOnlyToISO(t.invoiceMonth)!.slice(0, 7);
      const key = `${t.accountId}:${m}`;
      const cur = inv.get(key) ?? { accountId: t.accountId, month: m, dueDate: "", total: 0, paid: true, count: 0 };
      cur.total += t.kind === "INCOME" ? -v : v;
      cur.count += t._count._all;
      if (!t.paid) cur.paid = false;
      inv.set(key, cur);
    }
  }
  for (const t of transfersIn) if (t.toAccountId && bal.has(t.toAccountId)) bal.set(t.toAccountId, bal.get(t.toAccountId)! + num(t._sum.amount));
  const accDTO: FinAccountDTO[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    color: a.color,
    initialBalance: num(a.initialBalance),
    closingDay: a.closingDay,
    dueDay: a.dueDay,
    creditLimit: a.creditLimit == null ? null : num(a.creditLimit),
    archived: a.archived,
    balance: Math.round(bal.get(a.id)! * 100) / 100,
  }));
  const byId = new Map(accDTO.map((a) => [a.id, a]));
  const invoices = [...inv.values()]
    .map((i) => ({ ...i, total: Math.round(i.total * 100) / 100, dueDate: dayInMonth(i.month, byId.get(i.accountId)?.dueDay ?? 10) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { accounts: accDTO, invoices };
}

/** Totais de receitas e despesas por mês (para o gráfico de evolução). */
/**
 * Mês em que o lançamento conta: compra no cartão conta no mês da fatura (quando é paga);
 * o resto, pela data. Assim parcelas antigas aparecem no mês da fatura atual.
 */
const inMonths = (from: string, toExclusive: string) => ({
  OR: [
    { invoiceMonth: { gte: monthDate(from), lt: monthDate(toExclusive) } },
    { invoiceMonth: null, date: { gte: monthDate(from), lt: monthDate(toExclusive) } },
  ],
});
const monthOfTx = (t: { invoiceMonth: Date | null; date: Date }) => dateOnlyToISO(t.invoiceMonth ?? t.date)!.slice(0, 7);

export async function getHistory(ownerId: string, lastMonth: string, n = 12) {
  const first = addMonth(lastMonth, -(n - 1));
  const rows = await db.finTransaction.findMany({
    where: { ownerId, deletedAt: null, kind: { in: ["INCOME", "EXPENSE"] }, ...inMonths(first, addMonth(lastMonth, 1)) },
    select: { kind: true, amount: true, date: true, invoiceMonth: true },
  });
  const out = Array.from({ length: n }, (_, i) => ({ month: addMonth(first, i), income: 0, expense: 0 }));
  for (const r of rows) {
    const slot = out.find((x) => x.month === monthOfTx(r));
    if (!slot) continue;
    if (r.kind === "INCOME") slot.income += num(r.amount);
    else slot.expense += num(r.amount);
  }
  return out.map((x) => ({ ...x, income: Math.round(x.income), expense: Math.round(x.expense) }));
}

/** Lançamentos de um mês (compras de cartão pelo mês da fatura). */
export async function getMonthTx(ownerId: string, month: string) {
  const rows = await db.finTransaction.findMany({
    where: { ownerId, deletedAt: null, ...inMonths(month, addMonth(month, 1)) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toTxDTO);
}

/** Contas a pagar/receber em aberto até o fim do mês (inclui atrasadas de meses anteriores), fora cartão. */
export async function getOpenItems(ownerId: string, month: string) {
  const rows = await db.finTransaction.findMany({
    where: {
      ownerId,
      deletedAt: null,
      paid: false,
      cardPending: false,
      kind: { in: ["EXPENSE", "INCOME"] },
      date: { lt: monthDate(addMonth(month, 1)) },
      OR: [{ accountId: null }, { account: { type: { not: "CREDIT_CARD" } } }],
    },
    orderBy: { date: "asc" },
    take: 200,
  });
  return rows.map(toTxDTO);
}

/** Para o resumo da manhã: contas que vencem hoje e atrasadas. */
export async function billsSummary(ownerId: string, today: string) {
  const rows = await db.finTransaction.findMany({
    where: { ownerId, deletedAt: null, paid: false, cardPending: false, kind: "EXPENSE", date: { lte: isoDate(today) }, OR: [{ accountId: null }, { account: { type: { not: "CREDIT_CARD" } } }] },
    select: { amount: true, date: true, description: true },
  });
  const due = rows.filter((r) => dateOnlyToISO(r.date) === today);
  const late = rows.filter((r) => dateOnlyToISO(r.date)! < today);
  return { due: due.length, dueTotal: due.reduce((t, r) => t + num(r.amount), 0), late: late.length, first: due[0]?.description ?? null };
}
