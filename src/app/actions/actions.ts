"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { isoToDateOnly, todayISO } from "@/lib/dates";
import { fail, logActivity, refreshAll, type Result } from "./_shared";
import type { ActionStatus } from "@/generated/prisma/enums";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(40);

const actionInput = z.object({
  title: z.string().trim().min(1, "Informe o título.").max(300),
  description: z.string().trim().max(5000).nullish(),
  sectorId: id.nullish(),
  assigneeId: id.nullish(),
  kind: z.enum(["DO", "DELEGATE", "FOLLOW_UP", "DECIDE"]).default("DO"),
  origin: z.enum(["MEETING", "DEMAND", "KPI", "CAPTURE", "VISIT"]).default("CAPTURE"),
  originNote: z.string().max(200).nullish(),
  demandId: id.nullish(),
  dueDate: iso.nullish(),
  urgent: z.boolean().default(false),
  important: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

async function ownAction(ownerId: string, actionId: string) {
  const a = await db.action.findFirst({ where: { id: actionId, ownerId } });
  if (!a) throw new Error("Ação não encontrada.");
  return a;
}

async function tagConnect(ownerId: string, names: string[]) {
  const uniq = [...new Set(names.map((n) => n.toLowerCase()))];
  const tags = await Promise.all(
    uniq.map((name) =>
      db.tag.upsert({ where: { ownerId_name: { ownerId, name } }, create: { ownerId, name }, update: {} }),
    ),
  );
  return tags.map((t) => ({ id: t.id }));
}

export async function createAction(raw: z.input<typeof actionInput>): Promise<Result<{ id: string }>> {
  try {
    const user = await actionUser();
    const d = actionInput.parse(raw);
    const delegated = !!d.assigneeId;
    const a = await db.action.create({
      data: {
        ownerId: user.id,
        title: d.title,
        description: d.description ?? null,
        sectorId: d.sectorId ?? null,
        assigneeId: d.assigneeId ?? null,
        kind: d.kind,
        origin: d.origin,
        originNote: d.originNote ?? null,
        demandId: d.demandId ?? null,
        dueDate: isoToDateOnly(d.dueDate ?? null),
        urgent: d.urgent,
        important: d.important,
        status: delegated ? "WAITING" : "TODO",
        lastFollowUpAt: delegated ? new Date() : null,
        tags: d.tags.length ? { connect: await tagConnect(user.id, d.tags) } : undefined,
      },
    });
    await logActivity({ ownerId: user.id, sectorId: a.sectorId, entityType: "action", entityId: a.id, verb: "created", summary: `Ação criada: ${a.title}` });
    refreshAll();
    return { ok: true, data: { id: a.id } };
  } catch (e) {
    return fail(e);
  }
}

const patchInput = actionInput.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELED"]).optional(),
  alertAfterDays: z.number().int().min(1).max(60).nullish(),
});

export async function updateAction(actionId: string, raw: z.input<typeof patchInput>): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    const d = patchInput.parse(raw);
    await db.action.update({
      where: { id: cur.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description ?? null }),
        ...(d.sectorId !== undefined && { sectorId: d.sectorId ?? null }),
        ...(d.assigneeId !== undefined && { assigneeId: d.assigneeId ?? null }),
        ...(d.kind !== undefined && { kind: d.kind }),
        ...(d.dueDate !== undefined && { dueDate: isoToDateOnly(d.dueDate ?? null) }),
        ...(d.urgent !== undefined && { urgent: d.urgent }),
        ...(d.important !== undefined && { important: d.important }),
        ...(d.alertAfterDays !== undefined && { alertAfterDays: d.alertAfterDays ?? null }),
        ...(d.status !== undefined && {
          status: d.status,
          completedAt: d.status === "DONE" ? (cur.completedAt ?? new Date()) : null,
        }),
        ...(d.tags !== undefined && { tags: { set: await tagConnect(user.id, d.tags) } }),
      },
    });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function completeAction(actionId: string): Promise<Result<{ prev: ActionStatus }>> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    await db.action.update({ where: { id: cur.id }, data: { status: "DONE", completedAt: new Date() } });
    await logActivity({ ownerId: user.id, sectorId: cur.sectorId, entityType: "action", entityId: cur.id, verb: "done", summary: `Concluída: ${cur.title}` });
    refreshAll();
    return { ok: true, data: { prev: cur.status } };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenAction(actionId: string, prev: ActionStatus = "TODO"): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    const status = prev === "DONE" || prev === "CANCELED" ? "TODO" : prev;
    await db.action.update({ where: { id: cur.id }, data: { status, completedAt: null } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function snoozeAction(actionId: string, dueDate: string): Promise<Result<{ prev: string | null }>> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    await db.action.update({ where: { id: cur.id }, data: { dueDate: isoToDateOnly(iso.parse(dueDate)) } });
    refreshAll();
    return { ok: true, data: { prev: cur.dueDate ? cur.dueDate.toISOString().slice(0, 10) : null } };
  } catch (e) {
    return fail(e);
  }
}

export async function setDueDate(actionId: string, dueDate: string | null): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    await db.action.update({ where: { id: cur.id }, data: { dueDate: isoToDateOnly(dueDate ? iso.parse(dueDate) : null) } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAction(actionId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    await db.action.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreAction(actionId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    await db.action.update({ where: { id: cur.id }, data: { deletedAt: null } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const updateInput = z.object({
  kind: z.enum(["COMMENT", "FOLLOW_UP", "EVIDENCE"]),
  text: z.string().trim().max(5000).nullish(),
  attachments: z
    .array(
      z.object({
        url: z
          .string()
          .url()
          .refine((u) => new URL(u).hostname.endsWith(".blob.vercel-storage.com"), "Arquivo de origem inválida."),
        pathname: z.string().max(500),
        mimeType: z.string().max(150),
        size: z.number().int().nonnegative(),
        name: z.string().trim().max(200).optional(),
      }),
    )
    .max(20)
    .default([]),
});

export async function addActionUpdate(actionId: string, raw: z.input<typeof updateInput>): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    const d = updateInput.parse(raw);
    if (!d.text && !d.attachments.length && d.kind !== "FOLLOW_UP") throw new Error("Escreva algo ou anexe uma foto.");
    await db.actionUpdate.create({
      data: {
        actionId: cur.id,
        kind: d.kind,
        text: d.text || (d.kind === "FOLLOW_UP" ? "Cobrança registrada." : null),
        attachments: d.attachments.length
          ? { create: d.attachments.map((a) => ({ ...a, ownerId: user.id })) }
          : undefined,
      },
    });
    if (d.kind === "FOLLOW_UP") {
      await db.action.update({ where: { id: cur.id }, data: { lastFollowUpAt: new Date() } });
      await logActivity({ ownerId: user.id, sectorId: cur.sectorId, entityType: "action", entityId: cur.id, verb: "follow_up", summary: `Follow-up: ${cur.title}` });
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addSubtask(actionId: string, title: string): Promise<Result> {
  try {
    const user = await actionUser();
    const cur = await ownAction(user.id, id.parse(actionId));
    const t = z.string().trim().min(1, "Escreva a subação.").max(200).parse(title);
    const count = await db.subtask.count({ where: { actionId: cur.id } });
    await db.subtask.create({ data: { actionId: cur.id, title: t, order: count } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleSubtask(subtaskId: string, done: boolean): Promise<Result> {
  try {
    const user = await actionUser();
    const s = await db.subtask.findFirst({ where: { id: id.parse(subtaskId), action: { ownerId: user.id } } });
    if (!s) throw new Error("Subação não encontrada.");
    await db.subtask.update({ where: { id: s.id }, data: { done } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSubtask(subtaskId: string): Promise<Result> {
  try {
    const user = await actionUser();
    const s = await db.subtask.findFirst({ where: { id: id.parse(subtaskId), action: { ownerId: user.id } } });
    if (!s) throw new Error("Subação não encontrada.");
    await db.subtask.delete({ where: { id: s.id } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Define as prioridades do dia (até 5, na ordem). */
export async function setPriorities(ids: string[]): Promise<Result> {
  try {
    const user = await actionUser();
    const list = z.array(id).max(5).parse(ids);
    const date = isoToDateOnly(todayISO())!;
    const owned = await db.action.findMany({ where: { ownerId: user.id, id: { in: list } }, select: { id: true } });
    const ok = new Set(owned.map((o) => o.id));
    await db.$transaction([
      db.dailyPriority.deleteMany({ where: { ownerId: user.id, date } }),
      db.dailyPriority.createMany({
        data: list.filter((x) => ok.has(x)).map((actionId, position) => ({ ownerId: user.id, date, actionId, position })),
      }),
    ]);
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
