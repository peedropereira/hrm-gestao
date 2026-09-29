// Objetos simples (serializáveis) que vão do servidor para os componentes de tela.
import type { ActionKind, ActionOrigin, ActionStatus } from "@/generated/prisma/enums";

export type SectorDTO = {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  color: string;
  icon: string;
  parentId: string | null;
  order: number;
  active: boolean;
  personal: boolean;
};

export type PersonDTO = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  sectorId: string | null;
  isLeader: boolean;
};

export type ActionDTO = {
  id: string;
  title: string;
  description: string | null;
  sectorId: string | null;
  assigneeId: string | null;
  kind: ActionKind;
  origin: ActionOrigin;
  originNote: string | null;
  eventId: string | null; // compromisso (ata) que gerou a ação
  dueDate: string | null; // yyyy-mm-dd
  urgent: boolean;
  important: boolean;
  status: ActionStatus;
  completedAt: string | null; // ISO timestamp
  lastFollowUpAt: string | null; // yyyy-mm-dd (dia do último follow-up)
  createdAt: string;
  alertAfterDays: number | null;
  subtasksDone: number;
  subtasksTotal: number;
  tags: string[];
};

export type OccurrenceDTO = {
  key: string; // único na lista
  eventId: string; // registro no banco (série, ocorrência editada ou evento avulso)
  seriesId: string | null; // série à qual pertence
  virtual: boolean; // ocorrência calculada da série (ainda sem registro próprio)
  date: string; // yyyy-mm-dd
  start: string; // HH:mm
  end: string;
  startsAt: string; // ISO
  endsAt: string;
  allDay: boolean;
  title: string;
  type: "MEETING" | "CLIENT_VISIT" | "TECH_VISIT" | "AUDIT" | "SECTOR_MEETING" | "PERSONAL_BLOCK" | "FOLLOW_UP";
  location: string | null;
  sectorId: string | null;
  demandId: string | null;
  linkedActionId: string | null;
  attendees: string | null;
  reminderMinutes: number | null; // null = padrão das configurações
  recurring: boolean;
  ruleText: string;
  hasMinutes: boolean;
  actionsCount: number;
  attachmentsCount: number;
  href: string;
};

export type AttachmentDTO = {
  id: string;
  url: string;
  name: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  source?: string; // de onde veio: "Ação: …", "Demanda: …"
};

export type ActionExtra = {
  subtasks: { id: string; title: string; done: boolean }[];
  updates: {
    id: string;
    kind: "COMMENT" | "FOLLOW_UP" | "EVIDENCE";
    text: string | null;
    createdAt: string;
    attachments: { id: string; url: string; mimeType: string; name: string | null; size: number }[];
  }[];
};

export type Tone = "red" | "amber" | "green" | "blue" | "neutral" | "accent";

export type SemaforoStatus = "red" | "amber" | "green";
export type SectorHealth = {
  sectorId: string;
  status: SemaforoStatus;
  reason: string;
  overdue: number;
  open: number;
};

export type AppContextData = {
  today: string;
  userName: string;
  sectors: SectorDTO[];
  people: PersonDTO[];
  inboxCount: number;
  overdueCount: number;
  delegateAlertDays: number;
  reminderMinutes: number; // aviso padrão antes dos compromissos
  ai: boolean; // interpretação por IA disponível na captura
};
