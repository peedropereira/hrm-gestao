"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { isoToDateOnly, todayISO } from "@/lib/dates";
import { parseNL } from "@/lib/nl-parse";
import { fail, logActivity, refreshAll, type Result } from "./_shared";

const id = z.string().min(1).max(40);
const text = z.string().trim().min(1, "Escreva algo para capturar.").max(2000);

export async function captureToInbox(raw: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const item = await db.inboxItem.create({ data: { ownerId: user.id, text: text.parse(raw) } });
    refreshAll();
    return { ok: true, data: { id: item.id } };
  } catch (e) {
    return fail(e);
  }
}

async function ownPending(ownerId: string, itemId: string) {
  const item = await db.inboxItem.findFirst({ where: { id: id.parse(itemId), ownerId } });
  if (!item) throw new Error("Item não encontrado.");
  return item;
}

/** Um toque: interpreta o texto e cria a ação. */
export async function triageToAction(itemId: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const item = await ownPending(user.id, itemId);
    const [people, sectors] = await Promise.all([
      db.person.findMany({ where: { ownerId: user.id, deletedAt: null }, select: { id: true, name: true, sectorId: true } }),
      db.sector.findMany({ where: { ownerId: user.id, deletedAt: null }, select: { id: true, name: true, shortName: true, slug: true } }),
    ]);
    const r = parseNL(item.text, { today: todayISO(), people, sectors });
    const a = await db.action.create({
      data: {
        ownerId: user.id,
        title: r.title || item.text.slice(0, 300),
        kind: r.kind,
        assigneeId: r.assigneeId,
        sectorId: r.sectorId,
        dueDate: isoToDateOnly(r.dueDate),
        urgent: r.urgent,
        important: r.important,
        origin: "CAPTURE",
        status: r.assigneeId ? "WAITING" : "TODO",
        lastFollowUpAt: r.assigneeId ? new Date() : null,
      },
    });
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "TRIAGED", convertedTo: "ACTION", convertedId: a.id, triagedAt: new Date() } });
    await logActivity({ ownerId: user.id, sectorId: a.sectorId, entityType: "action", entityId: a.id, verb: "created", summary: `Ação criada da caixa de entrada: ${a.title}` });
    refreshAll();
    return { ok: true, data: { id: a.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function triageToDemand(itemId: string, sectorId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const item = await ownPending(user.id, itemId);
    const sec = await db.sector.findFirst({ where: { id: id.parse(sectorId), ownerId: user.id } });
    if (!sec) throw new Error("Escolha um setor.");
    const d = await db.demand.create({ data: { ownerId: user.id, sectorId: sec.id, title: item.text.slice(0, 300), source: "Captura rápida" } });
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "TRIAGED", convertedTo: "DEMAND", convertedId: d.id, triagedAt: new Date() } });
    await logActivity({ ownerId: user.id, sectorId: sec.id, entityType: "demand", entityId: d.id, verb: "created", summary: `Demanda registrada: ${d.title}` });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function triageToNeed(itemId: string, sectorId: string, category: string): Promise<Result> {
  try {
    const user = await actionUser();
    const item = await ownPending(user.id, itemId);
    const sec = await db.sector.findFirst({ where: { id: id.parse(sectorId), ownerId: user.id } });
    if (!sec) throw new Error("Escolha um setor.");
    const cat = z.enum(["PEOPLE", "EQUIPMENT", "INVESTMENT", "TRAINING", "PROCESS"]).parse(category);
    const n = await db.need.create({ data: { ownerId: user.id, sectorId: sec.id, title: item.text.slice(0, 300), category: cat } });
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "TRIAGED", convertedTo: "NEED", convertedId: n.id, triagedAt: new Date() } });
    await logActivity({ ownerId: user.id, sectorId: sec.id, entityType: "need", entityId: n.id, verb: "created", summary: `Necessidade levantada: ${n.title}` });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function triageToNote(itemId: string, sectorId: string | null): Promise<Result> {
  try {
    const user = await actionUser();
    const item = await ownPending(user.id, itemId);
    let sid: string | null = null;
    if (sectorId) {
      const sec = await db.sector.findFirst({ where: { id: id.parse(sectorId), ownerId: user.id } });
      sid = sec?.id ?? null;
    }
    const n = await db.note.create({ data: { ownerId: user.id, sectorId: sid, content: item.text } });
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "TRIAGED", convertedTo: "NOTE", convertedId: n.id, triagedAt: new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function discardInbox(itemId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const item = await ownPending(user.id, itemId);
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "DISCARDED", triagedAt: new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Desfaz a triagem: volta o item para pendente (e apaga o que foi criado, se for o caso). */
export async function undoTriage(itemId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const item = await ownPending(user.id, itemId);
    if (item.convertedTo && item.convertedId) {
      const now = new Date();
      if (item.convertedTo === "ACTION") await db.action.updateMany({ where: { id: item.convertedId, ownerId: user.id }, data: { deletedAt: now } });
      if (item.convertedTo === "DEMAND") await db.demand.updateMany({ where: { id: item.convertedId, ownerId: user.id }, data: { deletedAt: now } });
      if (item.convertedTo === "NEED") await db.need.updateMany({ where: { id: item.convertedId, ownerId: user.id }, data: { deletedAt: now } });
      if (item.convertedTo === "NOTE") await db.note.updateMany({ where: { id: item.convertedId, ownerId: user.id }, data: { deletedAt: now } });
    }
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "PENDING", convertedTo: null, convertedId: null, triagedAt: null } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
