"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { dateOnlyToISO, todayISO } from "@/lib/dates";
import { addMonth, dayInMonth, invoiceMonthOf } from "@/lib/fin-types";
import { isoDate, monthDate } from "@/lib/finance";
import { descKey } from "@/lib/fin-parse";
import { fail, refreshAll, type Result } from "./_shared";

const id = z.string().min(1).max(40);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const month = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido.");
const money = z.number().finite().positive("Informe um valor maior que zero.").max(1e10);

async function ownAccount(ownerId: string, accountId: string | null | undefined) {
  if (!accountId) return null;
  const a = await db.finAccount.findFirst({ where: { id: accountId, ownerId } });
  if (!a) throw new Error("Conta não encontrada.");
  return a;
}
async function checkCategory(ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return null;
  const c = await db.finCategory.findFirst({ where: { id: categoryId, ownerId } });
  if (!c) throw new Error("Categoria não encontrada.");
  return c.id;
}
const invoiceFor = (acc: Awaited<ReturnType<typeof ownAccount>>, date: string) =>
  acc?.type === "CREDIT_CARD" ? monthDate(invoiceMonthOf(date, acc.closingDay, acc.dueDay)) : null;

// ---------- lançamentos ----------

const txInput = z.object({
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  description: z.string().trim().min(1, "Informe a descrição.").max(200),
  amount: money,
  date: iso,
  paid: z.boolean().default(true),
  categoryId: id.nullish(),
  accountId: id.nullish(),
  toAccountId: id.nullish(),
  installments: z.number().int().min(1).max(48).default(1),
  cardPending: z.boolean().default(false),
  notes: z.string().trim().max(2000).nullish(),
});

/** Novo lançamento (parcelado gera uma parcela por mês) ou edição de um existente. */
export async function saveTransaction(raw: z.input<typeof txInput>, txId?: string, scope: "one" | "following" = "one"): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = txInput.parse(raw);
    const acc = await ownAccount(user.id, d.accountId);
    const toAcc = d.kind === "TRANSFER" ? await ownAccount(user.id, d.toAccountId) : null;
    if (d.kind === "TRANSFER" && (!acc || !toAcc)) throw new Error("Escolha a conta de origem e a de destino.");
    if (d.kind === "TRANSFER" && acc?.id === toAcc?.id) throw new Error("Origem e destino precisam ser contas diferentes.");
    const categoryId = d.kind === "TRANSFER" ? null : await checkCategory(user.id, d.categoryId);
    // "cartão (identificar na fatura)": fica pendente até a fatura ser lançada
    const cardPending = d.kind === "EXPENSE" && !acc && d.cardPending;
    const base = {
      kind: d.kind,
      categoryId,
      accountId: acc?.id ?? null,
      toAccountId: toAcc?.id ?? null,
      cardPending,
      notes: d.notes || null,
    };
    const onCard = cardPending || acc?.type === "CREDIT_CARD";

    if (txId) {
      const cur = await db.finTransaction.findFirst({ where: { id: id.parse(txId), ownerId: user.id, deletedAt: null } });
      if (!cur) throw new Error("Lançamento não encontrado.");
      const data = {
        ...base,
        description: d.description,
        amount: d.amount,
        date: isoDate(d.date),
        paid: onCard ? cur.paid && acc?.type === "CREDIT_CARD" : d.paid,
        paidAt: onCard ? cur.paidAt : d.paid ? (cur.paidAt ?? isoDate(d.date <= todayISO() ? d.date : todayISO())) : null,
        invoiceMonth: acc?.type === "CREDIT_CARD" ? (cur.accountId === acc.id && cur.invoiceMonth ? cur.invoiceMonth : invoiceFor(acc, d.date)) : null,
      };
      await db.finTransaction.update({ where: { id: cur.id }, data });
      if (scope === "following" && cur.installmentGroup && cur.installmentNo) {
        // demais parcelas: mesmos dados, valor e descrição
        const rest = await db.finTransaction.findMany({ where: { ownerId: user.id, installmentGroup: cur.installmentGroup, installmentNo: { gt: cur.installmentNo }, deletedAt: null } });
        for (const t of rest)
          await db.finTransaction.update({
            where: { id: t.id },
            data: { ...base, amount: d.amount, description: d.description, invoiceMonth: invoiceFor(acc, dateOnlyToISO(t.date)!) },
          });
      }
      refreshAll();
      return { ok: true, data: { id: cur.id } };
    }

    if (d.installments > 1 && d.kind !== "TRANSFER") {
      const group = randomUUID();
      const each = Math.floor((d.amount / d.installments) * 100) / 100;
      const last = Math.round((d.amount - each * (d.installments - 1)) * 100) / 100;
      const day = Number(d.date.slice(8, 10));
      const rows = Array.from({ length: d.installments }, (_, i) => {
        const date = i === 0 ? d.date : dayInMonth(addMonth(d.date.slice(0, 7), i), day);
        const isCard = acc?.type === "CREDIT_CARD";
        // no cartão, cada parcela vai para uma fatura; fora dele, só a 1ª nasce paga se marcado
        return {
          ownerId: user.id,
          ...base,
          description: `${d.description} (${i + 1}/${d.installments})`,
          amount: i === d.installments - 1 ? last : each,
          date: isoDate(date),
          paid: isCard ? false : i === 0 && d.paid,
          paidAt: !isCard && i === 0 && d.paid ? isoDate(date) : null,
          installmentGroup: group,
          installmentNo: i + 1,
          installmentTotal: d.installments,
          invoiceMonth: isCard ? monthDate(addMonth(invoiceMonthOf(d.date, acc!.closingDay, acc!.dueDay), i)) : null,
        };
      });
      await db.finTransaction.createMany({ data: rows });
      refreshAll();
      return { ok: true, data: { id: group } };
    }

    const t = await db.finTransaction.create({
      data: {
        ownerId: user.id,
        ...base,
        description: d.description,
        amount: d.amount,
        date: isoDate(d.date),
        paid: onCard ? false : d.paid,
        paidAt: !onCard && d.paid ? isoDate(d.date) : null,
        invoiceMonth: invoiceFor(acc, d.date),
      },
    });
    refreshAll();
    return { ok: true, data: { id: t.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setPaid(txId: string, paid: boolean): Promise<Result> {
  try {
    const user = await actionUser();
    const t = await db.finTransaction.findFirst({ where: { id: id.parse(txId), ownerId: user.id, deletedAt: null }, include: { account: { select: { type: true } } } });
    if (!t) throw new Error("Lançamento não encontrado.");
    if (t.cardPending || t.account?.type === "CREDIT_CARD") throw new Error("Este gasto é do cartão: ele é pago quando você paga a fatura inteira.");
    await db.finTransaction.update({ where: { id: t.id }, data: { paid, paidAt: paid ? isoDate(todayISO()) : null } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Exclui (só este ou esta e as próximas parcelas). Devolve os ids para desfazer. */
export async function deleteTransaction(txId: string, scope: "one" | "following" = "one"): Promise<Result<{ ids: string[] }>> {
  try {
    const user = await actionUser();
    const t = await db.finTransaction.findFirst({ where: { id: id.parse(txId), ownerId: user.id, deletedAt: null } });
    if (!t) throw new Error("Lançamento não encontrado.");
    const ids =
      scope === "following" && t.installmentGroup && t.installmentNo
        ? (await db.finTransaction.findMany({ where: { ownerId: user.id, installmentGroup: t.installmentGroup, installmentNo: { gte: t.installmentNo }, deletedAt: null }, select: { id: true } })).map((x) => x.id)
        : [t.id];
    await db.finTransaction.updateMany({ where: { id: { in: ids }, ownerId: user.id }, data: { deletedAt: new Date() } });
    refreshAll();
    return { ok: true, data: { ids } };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreTransactions(ids: string[]): Promise<Result> {
  try {
    const user = await actionUser();
    await db.finTransaction.updateMany({ where: { id: { in: z.array(id).max(60).parse(ids) }, ownerId: user.id }, data: { deletedAt: null } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- fatura do cartão ----------

/** Paga a fatura: marca as compras como pagas e registra a transferência da conta escolhida. */
export async function payInvoice(cardId: string, invoice: string, fromAccountId: string, date: string): Promise<Result> {
  try {
    const user = await actionUser();
    const card = await ownAccount(user.id, cardId);
    const from = await ownAccount(user.id, fromAccountId);
    if (!card || card.type !== "CREDIT_CARD") throw new Error("Cartão não encontrado.");
    if (!from || from.type === "CREDIT_CARD") throw new Error("Escolha a conta que vai pagar a fatura.");
    const m = month.parse(invoice);
    const items = await db.finTransaction.findMany({ where: { ownerId: user.id, accountId: card.id, invoiceMonth: monthDate(m), deletedAt: null, kind: { not: "TRANSFER" } } });
    const total = Math.round(items.reduce((t, x) => t + (x.kind === "INCOME" ? -Number(x.amount) : Number(x.amount)), 0) * 100) / 100;
    if (total <= 0) throw new Error("Esta fatura não tem valor a pagar.");
    await db.finTransaction.updateMany({ where: { id: { in: items.map((x) => x.id) } }, data: { paid: true, paidAt: isoDate(iso.parse(date)) } });
    await db.finTransaction.create({
      data: {
        ownerId: user.id,
        kind: "TRANSFER",
        description: `Pagamento da fatura ${card.name} (${m.slice(5)}/${m.slice(0, 4)})`,
        amount: total,
        date: isoDate(date),
        paid: true,
        paidAt: isoDate(date),
        accountId: from.id,
        toAccountId: card.id,
      },
    });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- fixos ----------

const recInput = z.object({
  kind: z.enum(["EXPENSE", "INCOME"]),
  description: z.string().trim().min(1, "Informe a descrição.").max(200),
  amount: money,
  categoryId: id.nullish(),
  accountId: id.nullish(),
  dayOfMonth: z.number().int().min(1).max(31),
  startMonth: month,
  endMonth: month.nullish(),
  variable: z.boolean().default(false),
  autoPaid: z.boolean().default(false),
  onCard: z.boolean().default(false),
  notes: z.string().trim().max(2000).nullish(),
});

/** Cria ou edita um fixo. Na edição, atualiza os lançamentos futuros ainda não pagos. */
export async function saveRecurring(raw: z.input<typeof recInput>, recId?: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = recInput.parse(raw);
    if (d.endMonth && d.endMonth < d.startMonth) throw new Error("O mês final precisa ser depois do inicial.");
    const acc = await ownAccount(user.id, d.accountId);
    const categoryId = await checkCategory(user.id, d.categoryId);
    const data = {
      kind: d.kind,
      description: d.description,
      amount: d.amount,
      categoryId,
      accountId: acc?.id ?? null,
      dayOfMonth: d.dayOfMonth,
      startMonth: monthDate(d.startMonth),
      endMonth: d.endMonth ? monthDate(d.endMonth) : null,
      variable: d.variable,
      autoPaid: d.autoPaid && !d.onCard && acc?.type !== "CREDIT_CARD",
      onCard: d.onCard && !acc,
      notes: d.notes || null,
    };
    if (recId) {
      const cur = await db.finRecurring.findFirst({ where: { id: id.parse(recId), ownerId: user.id } });
      if (!cur) throw new Error("Fixo não encontrado.");
      await db.finRecurring.update({ where: { id: cur.id }, data: { ...data, active: true } });
      const thisMonth = todayISO().slice(0, 7);
      const future = await db.finTransaction.findMany({ where: { ownerId: user.id, recurringId: cur.id, paid: false, deletedAt: null, recurringMonth: { gte: monthDate(thisMonth) } } });
      for (const t of future) {
        const m = dateOnlyToISO(t.recurringMonth)!.slice(0, 7);
        const outside = m < d.startMonth || (d.endMonth && m > d.endMonth);
        if (outside) {
          await db.finTransaction.delete({ where: { id: t.id } });
          continue;
        }
        const date = dayInMonth(m, d.dayOfMonth);
        await db.finTransaction.update({
          where: { id: t.id },
          data: {
            kind: d.kind,
            description: d.description,
            amount: d.amount,
            categoryId,
            accountId: acc?.id ?? null,
            date: isoDate(date),
            invoiceMonth: invoiceFor(acc, date),
            cardPending: data.onCard,
          },
        });
      }
      refreshAll();
      return { ok: true, data: { id: cur.id } };
    }
    const r = await db.finRecurring.create({ data: { ...data, ownerId: user.id } });
    refreshAll();
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Encerra o fixo: para de gerar e remove os lançamentos futuros não pagos. */
export async function endRecurring(recId: string, restore = false): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await db.finRecurring.findFirst({ where: { id: id.parse(recId), ownerId: user.id } });
    if (!cur) throw new Error("Fixo não encontrado.");
    if (restore) {
      await db.finRecurring.update({ where: { id: cur.id }, data: { active: true } });
    } else {
      await db.finRecurring.update({ where: { id: cur.id }, data: { active: false } });
      const next = addMonth(todayISO().slice(0, 7), 1);
      await db.finTransaction.deleteMany({ where: { ownerId: user.id, recurringId: cur.id, paid: false, recurringMonth: { gte: monthDate(next) } } });
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const importItem = z.object({
  description: z.string().trim().min(1).max(200),
  amount: money,
  dayOfMonth: z.number().int().min(1).max(31),
  categoryId: id.nullish(),
  kind: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  variable: z.boolean().default(false),
});

/** Cadastra vários fixos de uma vez (lista colada). */
export async function importRecurring(raw: z.input<typeof importItem>[], accountId?: string | null): Promise<Result<{ count: number }>> {
  try {
    const user = await actionUser();
    const list = z.array(importItem).min(1, "A lista está vazia.").max(200).parse(raw);
    const acc = await ownAccount(user.id, accountId);
    const cats = new Set((await db.finCategory.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((c) => c.id));
    const start = monthDate(todayISO().slice(0, 7));
    await db.finRecurring.createMany({
      data: list.map((x) => ({
        ownerId: user.id,
        kind: x.kind,
        description: x.description,
        amount: x.amount,
        dayOfMonth: x.dayOfMonth,
        categoryId: x.categoryId && cats.has(x.categoryId) ? x.categoryId : null,
        accountId: acc?.id ?? null,
        variable: x.variable,
        startMonth: start,
      })),
    });
    refreshAll();
    return { ok: true, data: { count: list.length } };
  } catch (e) {
    return fail(e);
  }
}

// ---------- contas e categorias ----------

const accInput = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(60),
  type: z.enum(["CHECKING", "SAVINGS", "CASH", "CREDIT_CARD", "INVESTMENT", "OTHER"]),
  initialBalance: z.number().finite().min(-1e10).max(1e10).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0e6e7e"),
  closingDay: z.number().int().min(1).max(31).nullish(),
  dueDay: z.number().int().min(1).max(31).nullish(),
  creditLimit: z.number().finite().min(0).max(1e10).nullish(),
});

export async function saveAccount(raw: z.input<typeof accInput>, accountId?: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = accInput.parse(raw);
    const card = d.type === "CREDIT_CARD";
    if (card && (!d.closingDay || !d.dueDay)) throw new Error("Informe o dia do fechamento e do vencimento do cartão.");
    const data = { ...d, closingDay: card ? d.closingDay : null, dueDay: card ? d.dueDay : null, creditLimit: card ? (d.creditLimit ?? null) : null };
    if (accountId) {
      const a = await ownAccount(user.id, accountId);
      await db.finAccount.update({ where: { id: a!.id }, data });
      refreshAll();
      return { ok: true, data: { id: a!.id } };
    }
    const a = await db.finAccount.create({ data: { ...data, ownerId: user.id, order: await db.finAccount.count({ where: { ownerId: user.id } }) } });
    refreshAll();
    return { ok: true, data: { id: a.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveAccount(accountId: string, archived = true): Promise<Result> {
  try {
    const user = await actionUser();
    const a = await ownAccount(user.id, accountId);
    await db.finAccount.update({ where: { id: a!.id }, data: { archived } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const catInput = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(60),
  kind: z.enum(["EXPENSE", "INCOME"]),
  group: z.string().trim().min(1, "Informe o grupo.").max(60),
  budget: z.number().finite().min(0).max(1e10).nullish(),
});

export async function saveCategory(raw: z.input<typeof catInput>, categoryId?: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = catInput.parse(raw);
    if (categoryId) {
      const c = await db.finCategory.findFirst({ where: { id: id.parse(categoryId), ownerId: user.id } });
      if (!c) throw new Error("Categoria não encontrada.");
      await db.finCategory.update({ where: { id: c.id }, data: { name: d.name, group: d.group, budget: d.budget ?? null } });
      refreshAll();
      return { ok: true, data: { id: c.id } };
    }
    const sibling = await db.finCategory.findFirst({ where: { ownerId: user.id, kind: d.kind, group: d.group } });
    const c = await db.finCategory.create({
      data: { ownerId: user.id, name: d.name, kind: d.kind, group: d.group, budget: d.budget ?? null, icon: sibling?.icon ?? "tag", color: sibling?.color ?? "#64748b", order: (sibling?.order ?? 9000) + 50 },
    });
    refreshAll();
    return { ok: true, data: { id: c.id } };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Já existe uma categoria com esse nome neste grupo." };
    return fail(e);
  }
}

/** Orçamento mensal de uma categoria (null remove). */
export async function setBudget(categoryId: string, budget: number | null): Promise<Result> {
  try {
    const user = await actionUser();
    const c = await db.finCategory.findFirst({ where: { id: id.parse(categoryId), ownerId: user.id } });
    if (!c) throw new Error("Categoria não encontrada.");
    await db.finCategory.update({ where: { id: c.id }, data: { budget: budget == null ? null : z.number().min(0).max(1e10).parse(budget) } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveCategory(categoryId: string, archived = true): Promise<Result> {
  try {
    const user = await actionUser();
    const c = await db.finCategory.findFirst({ where: { id: id.parse(categoryId), ownerId: user.id } });
    if (!c) throw new Error("Categoria não encontrada.");
    await db.finCategory.update({ where: { id: c.id }, data: { archived } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- importação de fatura (PDF) ----------

const invoiceItem = z.object({
  date: iso,
  description: z.string().trim().min(1).max(200),
  amount: money,
  credit: z.boolean().default(false), // estorno/crédito: abate da fatura
  categoryId: id.nullish(),
  matchTxId: id.nullish(), // gasto fixo já lançado que corresponde a esta linha
});

/**
 * Lança as compras da fatura no cartão.
 * Linhas que correspondem a fixos já lançados (ex.: Netflix) não duplicam: o fixo é ligado a esta fatura.
 */
export async function importInvoice(cardId: string, invoice: string, raw: z.input<typeof invoiceItem>[]): Promise<Result<{ created: number; matched: number; skipped: number }>> {
  try {
    const user = await actionUser();
    const card = await ownAccount(user.id, cardId);
    if (!card || card.type !== "CREDIT_CARD") throw new Error("Escolha um cartão de crédito.");
    const m = month.parse(invoice);
    const items = z.array(invoiceItem).min(1, "Nenhuma compra selecionada.").max(500).parse(raw);
    const cats = new Set((await db.finCategory.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((c) => c.id));
    const existing = await db.finTransaction.findMany({ where: { ownerId: user.id, accountId: card.id, invoiceMonth: monthDate(m), deletedAt: null } });
    const key = (d: string, a: number, desc: string) => `${d}|${a.toFixed(2)}|${desc.toLowerCase().replace(/\s+/g, " ").slice(0, 40)}`;
    const seen = new Set(existing.map((t) => key(dateOnlyToISO(t.date)!, Number(t.amount), t.description)));
    let created = 0;
    let matched = 0;
    let skipped = 0;
    for (const it of items) {
      if (it.matchTxId) {
        const t = await db.finTransaction.findFirst({ where: { id: it.matchTxId, ownerId: user.id, deletedAt: null } });
        if (t) {
          await db.finTransaction.update({ where: { id: t.id }, data: { accountId: card.id, invoiceMonth: monthDate(m), cardPending: false, amount: it.amount, paid: false, paidAt: null } });
          matched++;
          continue;
        }
      }
      const k = key(it.date, it.amount, it.description);
      if (seen.has(k)) {
        skipped++;
        continue;
      }
      seen.add(k);
      await db.finTransaction.create({
        data: {
          ownerId: user.id,
          kind: it.credit ? "INCOME" : "EXPENSE",
          description: it.description,
          amount: it.amount,
          date: isoDate(it.date),
          paid: false,
          categoryId: it.categoryId && cats.has(it.categoryId) ? it.categoryId : null,
          accountId: card.id,
          invoiceMonth: monthDate(m),
          notes: "Importado da fatura (PDF)",
        },
      });
      created++;
    }
    refreshAll();
    return { ok: true, data: { created, matched, skipped } };
  } catch (e) {
    return fail(e);
  }
}

/** Aplica a categoria a todos os lançamentos sem categoria com o mesmo estabelecimento. */
export async function applyCategoryToSimilar(txId: string, categoryId: string): Promise<Result<{ count: number }>> {
  try {
    const user = await actionUser();
    const t = await db.finTransaction.findFirst({ where: { id: id.parse(txId), ownerId: user.id } });
    if (!t) throw new Error("Lançamento não encontrado.");
    const cat = await checkCategory(user.id, categoryId);
    const key = descKey(t.description);
    if (!key) return { ok: true, data: { count: 0 } };
    const others = await db.finTransaction.findMany({ where: { ownerId: user.id, deletedAt: null, categoryId: null, kind: t.kind, id: { not: t.id } }, select: { id: true, description: true } });
    const ids = others.filter((o) => descKey(o.description) === key).map((o) => o.id);
    if (ids.length) await db.finTransaction.updateMany({ where: { id: { in: ids } }, data: { categoryId: cat } });
    refreshAll();
    return { ok: true, data: { count: ids.length } };
  } catch (e) {
    return fail(e);
  }
}

/** Define a categoria de um lançamento e, se pedido, dos iguais ainda sem categoria. */
export async function setTxCategory(txId: string, categoryId: string | null, similar = true): Promise<Result<{ count: number }>> {
  try {
    const user = await actionUser();
    const t = await db.finTransaction.findFirst({ where: { id: id.parse(txId), ownerId: user.id, deletedAt: null } });
    if (!t) throw new Error("Lançamento não encontrado.");
    const cat = categoryId ? await checkCategory(user.id, categoryId) : null;
    await db.finTransaction.update({ where: { id: t.id }, data: { categoryId: cat } });
    if (!cat || !similar) {
      refreshAll();
      return { ok: true, data: { count: 0 } };
    }
    return applyCategoryToSimilar(t.id, cat);
  } catch (e) {
    return fail(e);
  }
}
