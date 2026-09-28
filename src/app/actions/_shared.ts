import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

z.config(z.locales.pt());

export function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos." };
  const msg = error instanceof Error ? error.message : "Não foi possível salvar. Tente de novo.";
  // Mensagens nossas são em português; erros internos viram uma mensagem genérica.
  const safe = /[áéíóúãõçÁÉÍÓÚ]|Entre|Informe|Escolha|não/i.test(msg) ? msg : "Não foi possível salvar. Tente de novo.";
  if (safe !== msg) console.error(error);
  return { ok: false, error: safe };
}

export function refreshAll() {
  revalidatePath("/", "layout");
}

export async function logActivity(p: {
  ownerId: string;
  sectorId: string | null | undefined;
  entityType: string;
  entityId: string;
  verb: string;
  summary: string;
}) {
  await db.activityLog.create({
    data: {
      ownerId: p.ownerId,
      sectorId: p.sectorId ?? null,
      entityType: p.entityType,
      entityId: p.entityId,
      verb: p.verb,
      summary: p.summary.slice(0, 300),
    },
  });
}
