"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { isoToDateOnly } from "@/lib/dates";
import { norm } from "@/lib/nl-parse";
import { fail, logActivity, refreshAll, type Result } from "./_shared";

const id = z.string().min(1).max(40);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

async function ownSector(ownerId: string, sectorId: string) {
  const s = await db.sector.findFirst({ where: { id: id.parse(sectorId), ownerId, deletedAt: null } });
  if (!s) throw new Error("Setor não encontrado.");
  return s;
}

// ---------- Setores ----------

const sectorInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do setor.").max(80),
  shortName: optText(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Escolha uma cor."),
  icon: z.string().min(1).max(40),
  parentId: id.nullish(),
  active: z.boolean().default(true),
});

function slugify(s: string) {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "setor";
}

export async function saveSector(sectorId: string | null, raw: z.input<typeof sectorInput>): Promise<Result<{ slug: string }>> {
  try {
    const user = await actionUser();
    const d = sectorInput.parse(raw);
    if (sectorId) {
      const s = await ownSector(user.id, sectorId);
      await db.sector.update({ where: { id: s.id }, data: { ...d, parentId: d.parentId ?? null } });
      refreshAll();
      return { ok: true, data: { slug: s.slug } };
    }
    let slug = slugify(d.name);
    if (await db.sector.findFirst({ where: { ownerId: user.id, slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const count = await db.sector.count({ where: { ownerId: user.id } });
    await db.sector.create({ data: { ...d, parentId: d.parentId ?? null, slug, ownerId: user.id, order: count } });
    refreshAll();
    return { ok: true, data: { slug } };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Pessoas ----------

const personInput = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(100),
  role: optText(100),
  phone: optText(30),
  whatsapp: optText(30),
  email: z.string().trim().email("E-mail inválido.").max(120).nullish().or(z.literal("")).transform((v) => v || null),
  sectorId: id.nullish(),
  isLeader: z.boolean().default(false),
});

export async function savePerson(personId: string | null, raw: z.input<typeof personInput>): Promise<Result> {
  try {
    const user = await actionUser();
    const d = personInput.parse(raw);
    if (d.sectorId) await ownSector(user.id, d.sectorId);
    if (d.isLeader && d.sectorId) {
      await db.person.updateMany({ where: { ownerId: user.id, sectorId: d.sectorId, NOT: personId ? { id: personId } : undefined }, data: { isLeader: false } });
    }
    if (personId) {
      const p = await db.person.findFirst({ where: { id: personId, ownerId: user.id } });
      if (!p) throw new Error("Pessoa não encontrada.");
      await db.person.update({ where: { id: p.id }, data: { ...d, sectorId: d.sectorId ?? null } });
    } else {
      await db.person.create({ data: { ...d, sectorId: d.sectorId ?? null, ownerId: user.id } });
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePerson(personId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const p = await db.person.findFirst({ where: { id: id.parse(personId), ownerId: user.id } });
    if (!p) throw new Error("Pessoa não encontrada.");
    await db.person.update({ where: { id: p.id }, data: { deletedAt: new Date(), isLeader: false } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Demandas ----------

const demandInput = z.object({
  sectorId: id,
  title: z.string().trim().min(1, "Informe a demanda.").max(300),
  details: optText(5000),
  source: optText(100),
  receivedAt: iso.nullish(),
  dueDate: iso.nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELED"]).default("OPEN"),
});

export async function saveDemand(demandId: string | null, raw: z.input<typeof demandInput>): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = demandInput.parse(raw);
    await ownSector(user.id, d.sectorId);
    const data = {
      ...d,
      receivedAt: isoToDateOnly(d.receivedAt ?? null) ?? undefined,
      dueDate: isoToDateOnly(d.dueDate ?? null),
    };
    let savedId: string;
    if (demandId) {
      const cur = await db.demand.findFirst({ where: { id: demandId, ownerId: user.id } });
      if (!cur) throw new Error("Demanda não encontrada.");
      savedId = cur.id;
      await db.demand.update({ where: { id: cur.id }, data });
      if (cur.status !== d.status) {
        await logActivity({ ownerId: user.id, sectorId: d.sectorId, entityType: "demand", entityId: cur.id, verb: "status", summary: `Demanda “${d.title}” mudou de status` });
      }
    } else {
      const n = await db.demand.create({ data: { ...data, ownerId: user.id } });
      savedId = n.id;
      await logActivity({ ownerId: user.id, sectorId: d.sectorId, entityType: "demand", entityId: n.id, verb: "created", summary: `Demanda registrada: ${n.title}` });
    }
    refreshAll();
    return { ok: true, data: { id: savedId } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDemand(demandId: string, restore = false): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await db.demand.findFirst({ where: { id: id.parse(demandId), ownerId: user.id } });
    if (!cur) throw new Error("Demanda não encontrada.");
    await db.demand.update({ where: { id: cur.id }, data: { deletedAt: restore ? null : new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Necessidades ----------

const needInput = z.object({
  sectorId: id,
  title: z.string().trim().min(1, "Informe a necessidade.").max(300),
  details: optText(5000),
  category: z.enum(["PEOPLE", "EQUIPMENT", "INVESTMENT", "TRAINING", "PROCESS"]),
  estimatedCost: z.number().nonnegative().max(1e11).nullish(),
  recurring: z.boolean().default(false),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  status: z.enum(["RAISED", "ANALYSIS", "APPROVED", "FULFILLED", "REJECTED"]).default("RAISED"),
});

const NEED_WORD: Record<string, string> = { RAISED: "Levantada", ANALYSIS: "Em análise", APPROVED: "Aprovada", FULFILLED: "Atendida", REJECTED: "Recusada" };

export async function saveNeed(needId: string | null, raw: z.input<typeof needInput>): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = needInput.parse(raw);
    await ownSector(user.id, d.sectorId);
    const decided = ["APPROVED", "REJECTED", "FULFILLED"].includes(d.status);
    let savedId: string;
    if (needId) {
      const cur = await db.need.findFirst({ where: { id: needId, ownerId: user.id } });
      if (!cur) throw new Error("Necessidade não encontrada.");
      savedId = cur.id;
      await db.need.update({
        where: { id: cur.id },
        data: { ...d, estimatedCost: d.estimatedCost ?? null, decidedAt: decided ? (cur.decidedAt ?? new Date()) : null },
      });
      if (cur.status !== d.status) {
        await logActivity({ ownerId: user.id, sectorId: d.sectorId, entityType: "need", entityId: cur.id, verb: "status", summary: `Necessidade “${d.title}” foi para ${NEED_WORD[d.status]}` });
      }
    } else {
      const n = await db.need.create({ data: { ...d, estimatedCost: d.estimatedCost ?? null, ownerId: user.id, decidedAt: decided ? new Date() : null } });
      savedId = n.id;
      await logActivity({ ownerId: user.id, sectorId: d.sectorId, entityType: "need", entityId: n.id, verb: "created", summary: `Necessidade levantada: ${n.title}` });
    }
    refreshAll();
    return { ok: true, data: { id: savedId } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteNeed(needId: string, restore = false): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await db.need.findFirst({ where: { id: id.parse(needId), ownerId: user.id } });
    if (!cur) throw new Error("Necessidade não encontrada.");
    await db.need.update({ where: { id: cur.id }, data: { deletedAt: restore ? null : new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Notas ----------

export async function saveNote(noteId: string | null, sectorId: string | null, content: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const c = z.string().trim().min(1, "Escreva a nota.").max(10000).parse(content);
    if (sectorId) await ownSector(user.id, sectorId);
    let savedId: string;
    if (noteId) {
      const cur = await db.note.findFirst({ where: { id: noteId, ownerId: user.id } });
      if (!cur) throw new Error("Nota não encontrada.");
      savedId = cur.id;
      await db.note.update({ where: { id: cur.id }, data: { content: c } });
    } else {
      savedId = (await db.note.create({ data: { ownerId: user.id, sectorId, content: c } })).id;
    }
    refreshAll();
    return { ok: true, data: { id: savedId } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteNote(noteId: string, restore = false): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await db.note.findFirst({ where: { id: id.parse(noteId), ownerId: user.id } });
    if (!cur) throw new Error("Nota não encontrada.");
    await db.note.update({ where: { id: cur.id }, data: { deletedAt: restore ? null : new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
