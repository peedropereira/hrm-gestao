"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { fail, logActivity, refreshAll, type Result } from "./_shared";

// Metas: cadastro, arquivamento e lançamento mensal.

const id = z.string().min(1).max(40);
const month = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido.");
const num = z.number().finite().min(-1e12).max(1e12);

const kpiInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do indicador.").max(120),
  sectorId: id,
  unit: z.string().trim().min(1, "Informe a unidade.").max(20),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  target: num,
  source: z.string().trim().max(200).nullish(),
  template: z.string().max(40).nullish(),
});

const monthDate = (m: string) => new Date(`${m}-01T00:00:00Z`);

async function ownKpi(ownerId: string, kpiId: string) {
  const k = await db.kpi.findFirst({ where: { id: id.parse(kpiId), ownerId } });
  if (!k) throw new Error("Meta não encontrada.");
  return k;
}

export async function saveKpi(raw: z.input<typeof kpiInput>, kpiId?: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = kpiInput.parse(raw);
    if (!(await db.sector.findFirst({ where: { id: d.sectorId, ownerId: user.id } }))) throw new Error("Setor não encontrado.");
    const data = { name: d.name, sectorId: d.sectorId, unit: d.unit, direction: d.direction, target: d.target, source: d.source || null, template: d.template || null };
    if (kpiId) {
      const k = await ownKpi(user.id, kpiId);
      await db.kpi.update({ where: { id: k.id }, data });
      refreshAll();
      return { ok: true, data: { id: k.id } };
    }
    const k = await db.kpi.create({ data: { ...data, ownerId: user.id } });
    await logActivity({ ownerId: user.id, sectorId: k.sectorId, entityType: "kpi", entityId: k.id, verb: "created", summary: `Meta criada: ${k.name}` });
    refreshAll();
    return { ok: true, data: { id: k.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Arquiva (ou restaura) a meta. O histórico fica guardado. */
export async function archiveKpi(kpiId: string, restore = false): Promise<Result> {
  try {
    const user = await actionUser();
    const k = await ownKpi(user.id, kpiId);
    await db.kpi.update({ where: { id: k.id }, data: { deletedAt: restore ? null : new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const entryInput = z.object({ month, value: num.nullable(), target: num.nullish() });

/** Grava valores de uma meta (valor null apaga o mês). */
export async function saveKpiEntries(kpiId: string, raw: z.input<typeof entryInput>[]): Promise<Result> {
  try {
    const user = await actionUser();
    const k = await ownKpi(user.id, kpiId);
    const list = z.array(entryInput).min(1).max(60).parse(raw);
    for (const e of list) {
      if (e.value === null) {
        await db.kpiEntry.deleteMany({ where: { kpiId: k.id, month: monthDate(e.month) } });
        continue;
      }
      await db.kpiEntry.upsert({
        where: { kpiId_month: { kpiId: k.id, month: monthDate(e.month) } },
        create: { kpiId: k.id, month: monthDate(e.month), value: e.value, target: e.target ?? null },
        update: { value: e.value, ...(e.target !== undefined && { target: e.target }) },
      });
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Lançamento do mês: um valor por meta, tudo de uma vez. */
export async function saveMonth(m: string, raw: { kpiId: string; value: number | null }[]): Promise<Result<{ saved: number }>> {
  try {
    const user = await actionUser();
    const mm = month.parse(m);
    const list = z.array(z.object({ kpiId: id, value: num.nullable() })).max(200).parse(raw);
    const mine = new Set((await db.kpi.findMany({ where: { ownerId: user.id, deletedAt: null }, select: { id: true } })).map((k) => k.id));
    let saved = 0;
    for (const e of list) {
      if (!mine.has(e.kpiId)) continue;
      if (e.value === null) {
        await db.kpiEntry.deleteMany({ where: { kpiId: e.kpiId, month: monthDate(mm) } });
        continue;
      }
      await db.kpiEntry.upsert({
        where: { kpiId_month: { kpiId: e.kpiId, month: monthDate(mm) } },
        create: { kpiId: e.kpiId, month: monthDate(mm), value: e.value },
        update: { value: e.value },
      });
      saved++;
    }
    await logActivity({
      ownerId: user.id,
      sectorId: null,
      entityType: "kpi",
      entityId: mm,
      verb: "launched",
      summary: `Resultados de ${mm.slice(5)}/${mm.slice(0, 4)} lançados (${saved} ${saved === 1 ? "meta" : "metas"})`,
    });
    refreshAll();
    return { ok: true, data: { saved } };
  } catch (e) {
    return fail(e);
  }
}
