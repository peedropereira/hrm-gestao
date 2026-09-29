"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { getPeople, getSectors } from "@/lib/data";
import { formatLong, todayISO } from "@/lib/dates";
import { localTime } from "@/lib/agenda";
import { norm, parseNL } from "@/lib/nl-parse";
import { isAudio } from "@/lib/upload-rules";
import { aiConfig, transcribeAudio, writeWithClaude } from "@/lib/ai";
import { fail, logActivity, refreshAll, type Result } from "./_shared";

// Gravação de reuniões: partes de áudio, transcrição e ata.

const id = z.string().min(1).max(40);
const uploaded = z.object({
  url: z
    .string()
    .url()
    .refine((u) => new URL(u).hostname.endsWith(".blob.vercel-storage.com"), "Arquivo de origem inválida."),
  pathname: z.string().max(500),
  mimeType: z.string().max(150),
  size: z.number().int().nonnegative(),
  name: z.string().trim().max(200).optional(),
});

async function ownEvent(ownerId: string, eventId: string) {
  const e = await db.event.findFirst({ where: { id: id.parse(eventId), ownerId, deletedAt: null } });
  if (!e) throw new Error("Compromisso não encontrado.");
  if (e.rrule) throw new Error("Abra a data específica da reunião para gravar.");
  return e;
}

/** Guarda uma parte da gravação (ou um áudio enviado) no compromisso. */
export async function addRecordingPart(eventId: string, file: z.input<typeof uploaded>, durationSec: number | null): Promise<Result<{ attachmentId: string }>> {
  try {
    const user = await actionUser();
    const e = await ownEvent(user.id, eventId);
    const f = uploaded.parse(file);
    const a = await db.attachment.create({
      data: { ...f, ownerId: user.id, eventId: e.id, durationSec: durationSec == null ? null : Math.max(0, Math.round(durationSec)) },
    });
    refreshAll();
    return { ok: true, data: { attachmentId: a.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Transcrição ao vivo (feita pelo próprio aparelho), salva durante a gravação. */
export async function saveLiveTranscript(eventId: string, text: string): Promise<Result> {
  try {
    const user = await actionUser();
    const e = await ownEvent(user.id, eventId);
    await db.event.update({ where: { id: e.id }, data: { transcript: z.string().max(400000).parse(text).trim() || null } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function nameHint(ownerId: string, title: string) {
  const people = await getPeople(ownerId);
  return `Reunião “${title}” de uma caldeiraria industrial (vasos de pressão, solda, pintura, PCP). Nomes: ${people.map((p) => p.name).join(", ")}.`;
}

/** Transcreve uma parte de áudio no servidor (precisa de OPENAI_API_KEY). */
export async function transcribePart(attachmentId: string): Promise<Result<{ chars: number }>> {
  try {
    const user = await actionUser();
    const a = await db.attachment.findFirst({ where: { id: id.parse(attachmentId), ownerId: user.id }, include: { event: { select: { title: true } } } });
    if (!a || !isAudio(a.mimeType, a.name)) throw new Error("Áudio não encontrado.");
    if (a.transcript) return { ok: true, data: { chars: a.transcript.length } };
    const text = await transcribeAudio(a, await nameHint(user.id, a.event?.title ?? "reunião"));
    await db.attachment.update({ where: { id: a.id }, data: { transcript: text || "(sem fala reconhecida)" } });
    return { ok: true, data: { chars: text.length } };
  } catch (e) {
    return fail(e);
  }
}

/** Sem IA de redação: organiza a transcrição e separa frases que parecem tarefas. */
function draftWithoutAI(transcript: string, ctx: Parameters<typeof parseNL>[1]) {
  const sentences = transcript
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const taskish = /\b(vai|vou|vamos|fica com|ficou de|fica responsavel|precisa|precisamos|tem que|temos que|cobrar|enviar|mandar|fazer|verificar|comprar|providenciar|resolver|agendar|entregar|revisar|levantar)\b/;
  const actions: string[] = [];
  for (const s of sentences) {
    const n = norm(s);
    const r = parseNL(s, ctx);
    if (taskish.test(n) && (r.assigneeId || r.dueDate)) actions.push(`- ${s.replace(/[.!?]+$/, "")}`);
    if (actions.length >= 15) break;
  }
  return [
    "Transcrição da reunião (automática, revise)",
    transcript.trim(),
    "",
    actions.length ? "Possíveis ações (confira nome e prazo antes de gerar)" : "Nenhuma ação identificada automaticamente. Escreva as ações começando a linha com “-”.",
    ...actions,
  ].join("\n");
}

/**
 * Monta a ata a partir da gravação e grava no compromisso (acrescenta ao que já existe).
 * Com ANTHROPIC_API_KEY a ata vem redigida (resumo, decisões e ações); sem ela, vem a transcrição organizada.
 */
export async function generateMinutes(eventId: string): Promise<Result<{ minutes: string; usedAI: boolean }>> {
  try {
    const user = await actionUser();
    const e = await ownEvent(user.id, eventId);
    const parts = await db.attachment.findMany({ where: { eventId: e.id, ownerId: user.id, transcript: { not: null } }, orderBy: { createdAt: "asc" } });
    const fromParts = parts
      .filter((p) => isAudio(p.mimeType, p.name))
      .map((p) => p.transcript!)
      .filter((t) => t !== "(sem fala reconhecida)")
      .join("\n\n");
    const transcript = (fromParts || e.transcript || "").trim();
    if (transcript.length < 20) throw new Error("Ainda não há transcrição suficiente para montar a ata.");

    const [people, sectors] = await Promise.all([getPeople(user.id), getSectors(user.id)]);
    const date = todayISO(e.startsAt);
    let draft: string;
    let usedAI = false;
    if (aiConfig().write) {
      const system = [
        "Você redige atas de reunião em português do Brasil para Pedro Souza, gerente geral de uma caldeiraria industrial.",
        "Escreva de forma objetiva, sem inventar nada que não esteja na transcrição. Se algo estiver confuso, escreva (trecho confuso na gravação).",
        "Formato, em texto simples (sem markdown, sem negrito, sem #):",
        "Resumo",
        "2 a 5 frases.",
        "",
        "Assuntos tratados",
        "1. assunto — o que foi dito",
        "",
        "Decisões",
        "1. decisão",
        "",
        "Ações",
        "- Nome: o que fazer até prazo",
        "",
        "Regras das ações: uma por linha, começando com “- ”, com o primeiro nome do responsável, dois-pontos, a tarefa começando por verbo e o prazo dito (hoje, amanhã, sexta, dia 15, 15/10). Sem prazo dito, não invente. Nunca use “-” no começo de linhas fora da seção Ações.",
        `Pessoas da equipe: ${people.map((p) => p.name).join(", ") || "—"}.`,
        `Setores: ${sectors.map((s) => s.name).join(", ")}.`,
      ].join("\n");
      const prompt = `Reunião: ${e.title}\nData: ${formatLong(date)}, ${localTime(e.startsAt)}\nParticipantes: ${e.attendees || "não informado"}\n\nTranscrição:\n${transcript.slice(0, 180000)}`;
      draft = await writeWithClaude(system, prompt, 3000);
      usedAI = true;
    } else {
      draft = draftWithoutAI(transcript, { today: date, people, sectors });
    }

    const minutes = e.minutes?.trim() ? `${e.minutes.trim()}\n\n———\n${draft}` : draft;
    await db.event.update({ where: { id: e.id }, data: { minutes } });
    await logActivity({ ownerId: user.id, sectorId: e.sectorId, entityType: "event", entityId: e.id, verb: "minutes", summary: `Ata gerada da gravação: ${e.title}` });
    refreshAll();
    return { ok: true, data: { minutes, usedAI } };
  } catch (e) {
    return fail(e);
  }
}
