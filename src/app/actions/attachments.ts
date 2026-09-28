"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { fail, logActivity, refreshAll, type Result } from "./_shared";

const id = z.string().min(1).max(40);

const uploadedSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => new URL(u).hostname.endsWith(".blob.vercel-storage.com"), "Arquivo de origem inválida."),
  pathname: z.string().max(500),
  mimeType: z.string().max(150),
  size: z.number().int().nonnegative(),
  name: z.string().trim().max(200).optional(),
});

const target = z.object({
  kind: z.enum(["sector", "demand", "need", "note", "inbox"]),
  id,
});

async function resolveTarget(ownerId: string, t: z.infer<typeof target>) {
  const where = { id: t.id, ownerId };
  switch (t.kind) {
    case "sector": {
      const s = await db.sector.findFirst({ where, select: { id: true, name: true } });
      if (!s) throw new Error("Setor não encontrado.");
      return { data: { sectorId: s.id }, sectorId: s.id, label: `setor ${s.name}` };
    }
    case "demand": {
      const d = await db.demand.findFirst({ where, select: { id: true, sectorId: true, title: true } });
      if (!d) throw new Error("Demanda não encontrada.");
      return { data: { demandId: d.id }, sectorId: d.sectorId, label: `demanda “${d.title}”` };
    }
    case "need": {
      const n = await db.need.findFirst({ where, select: { id: true, sectorId: true, title: true } });
      if (!n) throw new Error("Necessidade não encontrada.");
      return { data: { needId: n.id }, sectorId: n.sectorId, label: `necessidade “${n.title}”` };
    }
    case "note": {
      const n = await db.note.findFirst({ where, select: { id: true, sectorId: true } });
      if (!n) throw new Error("Nota não encontrada.");
      return { data: { noteId: n.id }, sectorId: n.sectorId, label: "nota" };
    }
    case "inbox": {
      const i = await db.inboxItem.findFirst({ where, select: { id: true } });
      if (!i) throw new Error("Item não encontrado.");
      return { data: { inboxItemId: i.id }, sectorId: null, label: "caixa de entrada" };
    }
  }
}

/** Liga arquivos já enviados a um setor, demanda, necessidade, nota ou item da caixa. */
export async function attachFiles(rawTarget: z.input<typeof target>, rawFiles: z.input<typeof uploadedSchema>[]): Promise<Result> {
  try {
    const user = await actionUser();
    const t = target.parse(rawTarget);
    const files = z.array(uploadedSchema).min(1).max(20).parse(rawFiles);
    const r = await resolveTarget(user.id, t);
    await db.attachment.createMany({ data: files.map((f) => ({ ...f, ownerId: user.id, ...r.data })) });
    if (t.kind !== "inbox") {
      await logActivity({
        ownerId: user.id,
        sectorId: r.sectorId,
        entityType: "attachment",
        entityId: t.id,
        verb: "attached",
        summary: `${files.length} ${files.length === 1 ? "arquivo anexado" : "arquivos anexados"} em ${r.label}`,
      });
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type RemovedAttachment = Awaited<ReturnType<typeof db.attachment.findFirst>>;

/** Remove o anexo da tela. O arquivo fica guardado para permitir "Desfazer". */
export async function removeAttachment(attachmentId: string): Promise<Result<{ snapshot: NonNullable<RemovedAttachment> }>> {
  try {
    const user = await actionUser();
    const a = await db.attachment.findFirst({ where: { id: id.parse(attachmentId), ownerId: user.id } });
    if (!a) throw new Error("Anexo não encontrado.");
    await db.attachment.delete({ where: { id: a.id } });
    refreshAll();
    return { ok: true, data: { snapshot: a } };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreAttachment(snapshot: NonNullable<RemovedAttachment>): Promise<Result> {
  try {
    const user = await actionUser();
    if (snapshot.ownerId !== user.id) throw new Error("Anexo não encontrado.");
    uploadedSchema.parse({ url: snapshot.url, pathname: snapshot.pathname, mimeType: snapshot.mimeType, size: snapshot.size });
    await db.attachment.create({ data: { ...snapshot, createdAt: new Date(snapshot.createdAt) } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
