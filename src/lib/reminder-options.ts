// Opções de aviso antes dos compromissos (em minutos). -1 = sem aviso.

export const REMINDER_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: "Na hora" },
  { value: 5, label: "5 min antes" },
  { value: 10, label: "10 min antes" },
  { value: 15, label: "15 min antes" },
  { value: 30, label: "30 min antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
  { value: -1, label: "Sem aviso" },
];

export function reminderLabel(min: number | null | undefined) {
  if (min == null) return "Padrão";
  const hit = REMINDER_CHOICES.find((c) => c.value === min);
  if (hit) return hit.label;
  if (min % 1440 === 0) return `${min / 1440} dias antes`;
  if (min % 60 === 0) return `${min / 60} horas antes`;
  return `${min} min antes`;
}

/** "em 30 min", "em 1 h 15", "agora" */
export function untilLabel(ms: number) {
  const min = Math.round(ms / 60000);
  if (min <= 1) return "agora";
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24 && m === 0 && h % 24 === 0) return h === 24 ? "amanhã" : `em ${h / 24} dias`;
  return m ? `em ${h} h ${m}` : `em ${h} h`;
}
