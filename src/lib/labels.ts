// Rótulos em português para os enums do banco.
import type {
  ActionKind,
  ActionOrigin,
  ActionStatus,
  DemandStatus,
  NeedCategory,
  NeedStatus,
  Priority,
  EventType,
} from "@/generated/prisma/enums";

export const KIND_LABEL: Record<ActionKind, string> = {
  DO: "Fazer",
  DELEGATE: "Delegar",
  FOLLOW_UP: "Cobrar",
  DECIDE: "Decidir",
};

export const KIND_ICON: Record<ActionKind, string> = {
  DO: "play",
  DELEGATE: "forward",
  FOLLOW_UP: "bell-ring",
  DECIDE: "scale",
};

export const STATUS_LABEL: Record<ActionStatus, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando retorno",
  DONE: "Concluída",
  CANCELED: "Cancelada",
};

export const ORIGIN_LABEL: Record<ActionOrigin, string> = {
  MEETING: "Reunião",
  DEMAND: "Demanda",
  KPI: "Meta",
  CAPTURE: "Captura rápida",
  VISIT: "Visita",
};

export const DEMAND_STATUS_LABEL: Record<DemandStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  CANCELED: "Cancelada",
};

export const NEED_STATUS_LABEL: Record<NeedStatus, string> = {
  RAISED: "Levantada",
  ANALYSIS: "Em análise",
  APPROVED: "Aprovada",
  FULFILLED: "Atendida",
  REJECTED: "Recusada",
};

export const NEED_STATUS_TONE: Record<NeedStatus, "neutral" | "blue" | "green" | "red"> = {
  RAISED: "neutral",
  ANALYSIS: "blue",
  APPROVED: "green",
  FULFILLED: "green",
  REJECTED: "red",
};

export const NEED_CATEGORY_LABEL: Record<NeedCategory, string> = {
  PEOPLE: "Pessoas",
  EQUIPMENT: "Equipamento",
  INVESTMENT: "Investimento",
  TRAINING: "Treinamento",
  PROCESS: "Processo",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  MEETING: "Reunião",
  CLIENT_VISIT: "Visita a cliente",
  TECH_VISIT: "Visita técnica",
  AUDIT: "Auditoria",
  SECTOR_MEETING: "Reunião de setor",
  PERSONAL_BLOCK: "Bloqueio pessoal",
  FOLLOW_UP: "Follow-up",
};

export const EVENT_TYPE_ICON: Record<EventType, string> = {
  MEETING: "users",
  CLIENT_VISIT: "handshake",
  TECH_VISIT: "gauge",
  AUDIT: "clipboard-check",
  SECTOR_MEETING: "users",
  PERSONAL_BLOCK: "lock",
  FOLLOW_UP: "phone-call",
};

/** Quadrante da matriz de Eisenhower. */
export function quadrant(urgent: boolean, important: boolean): 0 | 1 | 2 | 3 {
  if (urgent && important) return 0;
  if (important) return 1;
  if (urgent) return 2;
  return 3;
}
export const QUADRANT_LABEL = ["Fazer agora", "Agendar", "Delegar", "Revisar"] as const;
export const QUADRANT_DESC = [
  "Urgente e importante",
  "Importante, não urgente",
  "Urgente, não importante",
  "Nem urgente nem importante",
] as const;

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
