"use server";

import { z } from "zod";
import { actionUser } from "@/lib/session";
import { getPeople, getSectors } from "@/lib/data";
import { formatLong, todayISO } from "@/lib/dates";
import { localTime } from "@/lib/agenda";
import type { NLResult } from "@/lib/nl-parse";

// Interpretação por IA (opcional): só roda se ANTHROPIC_API_KEY estiver nas variáveis da Vercel.
// Sem a chave, a captura usa só o interpretador local (que já funciona sem internet extra).

const KINDS = ["DO", "DELEGATE", "FOLLOW_UP", "DECIDE"] as const;
const EVENT_TYPES = ["MEETING", "CLIENT_VISIT", "TECH_VISIT", "AUDIT", "SECTOR_MEETING", "PERSONAL_BLOCK", "FOLLOW_UP"] as const;
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const out = z.object({
  isEvent: z.boolean(),
  title: z.string().min(1).max(200),
  kind: z.enum(KINDS).catch("DO"),
  eventType: z.enum(EVENT_TYPES).catch("MEETING"),
  personId: z.string().nullish(),
  sectorId: z.string().nullish(),
  date: iso.nullish().catch(null),
  startTime: hhmm.nullish().catch(null),
  endTime: hhmm.nullish().catch(null),
  location: z.string().max(200).nullish(),
  reminderMinutes: z.number().int().min(-1).max(10080).nullish().catch(null),
  urgent: z.boolean().catch(false),
  important: z.boolean().catch(false),
});

const TOOL = {
  name: "registrar",
  description: "Registra a tarefa ou compromisso entendido a partir da fala.",
  input_schema: {
    type: "object",
    properties: {
      isEvent: { type: "boolean", description: "true se for compromisso de agenda (reunião, visita, auditoria, consulta, algo com horário marcado)." },
      title: { type: "string", description: "Título curto e claro em português, com inicial maiúscula. Sem data, hora, setor ou aviso. Em compromissos, mantenha com quem é (ex.: 'Reunião com o Anderson sobre hora extra')." },
      kind: { type: "string", enum: KINDS, description: "Para tarefas: DO fazer eu mesmo, DELEGATE passar para alguém, FOLLOW_UP cobrar/acompanhar, DECIDE decidir/aprovar." },
      eventType: { type: "string", enum: EVENT_TYPES, description: "Para compromissos." },
      personId: { type: ["string", "null"], description: "id da pessoa citada (lista fornecida) ou null." },
      sectorId: { type: ["string", "null"], description: "id do setor (lista fornecida). Deduza pelo assunto ou pela pessoa. Assuntos pessoais (saúde, família, casa, finanças pessoais) vão para o setor Pessoal." },
      date: { type: ["string", "null"], description: "Data yyyy-mm-dd (prazo da tarefa ou dia do compromisso) ou null." },
      startTime: { type: ["string", "null"], description: "HH:mm (24h). 'às 3' em contexto de trabalho = 15:00." },
      endTime: { type: ["string", "null"], description: "HH:mm. Se não dito, início + 1 hora (ou a duração falada)." },
      location: { type: ["string", "null"] },
      reminderMinutes: { type: ["integer", "null"], description: "Aviso antes em minutos se a pessoa pediu (ex.: 'me avise 15 minutos antes' = 15; 'sem aviso' = -1). Senão null." },
      urgent: { type: "boolean" },
      important: { type: "boolean" },
    },
    required: ["isEvent", "title", "kind", "eventType", "personId", "sectorId", "date", "startTime", "endTime", "location", "reminderMinutes", "urgent", "important"],
  },
} as const;

export async function interpretCapture(text: string): Promise<{ ok: true; data: NLResult | null } | { ok: false; error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: true, data: null };
  try {
    const user = await actionUser();
    const t = z.string().trim().min(3).max(1000).parse(text);
    const [people, sectors] = await Promise.all([getPeople(user.id), getSectors(user.id)]);
    const today = todayISO();
    const now = localTime(new Date());
    const secName = new Map(sectors.map((s) => [s.id, s.name]));
    const system = [
      "Você transforma frases faladas em português (Brasil) por um gerente de uma caldeiraria em tarefas ou compromissos.",
      `Hoje é ${formatLong(today)} (${today}), agora são ${now}, fuso de São Paulo.`,
      "Setores (id: nome):",
      ...sectors.filter((s) => s.active).map((s) => `- ${s.id}: ${s.name}${s.personal ? " (assuntos pessoais)" : ""}`),
      "Pessoas (id: nome, setor):",
      ...people.map((p) => `- ${p.id}: ${p.name}${p.sectorId ? `, ${secName.get(p.sectorId) ?? ""}` : ""}`),
      "Use só ids das listas. Datas relativas (amanhã, sexta, dia 5) são sempre a próxima ocorrência a partir de hoje.",
    ].join("\n");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "registrar" },
        messages: [{ role: "user", content: t }],
      }),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      console.error("IA falhou", res.status, await res.text().catch(() => ""));
      return { ok: true, data: null };
    }
    const json = (await res.json()) as { content?: { type: string; input?: unknown }[] };
    const input = json.content?.find((c) => c.type === "tool_use")?.input;
    const d = out.safeParse(input);
    if (!d.success) return { ok: true, data: null };
    const v = d.data;
    const person = people.find((p) => p.id === v.personId) ?? null;
    const sector = sectors.find((s) => s.id === v.sectorId) ?? null;
    return {
      ok: true,
      data: {
        title: v.title,
        kind: v.isEvent ? "DO" : v.kind === "DO" && person ? "DELEGATE" : v.kind,
        assigneeId: person?.id ?? null,
        sectorId: sector?.id ?? person?.sectorId ?? null,
        sectorInferred: !sector && !!person?.sectorId,
        dueDate: v.date ?? null,
        urgent: v.urgent,
        important: v.important,
        tags: [],
        isEvent: v.isEvent,
        eventType: v.eventType,
        startTime: v.startTime ?? null,
        endTime: v.endTime ?? null,
        durationMin: null,
        reminderMinutes: v.reminderMinutes ?? null,
        location: v.location || null,
      },
    };
  } catch (e) {
    console.error("IA indisponível", e);
    return { ok: true, data: null };
  }
}
