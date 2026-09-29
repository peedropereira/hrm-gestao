// Metas e indicadores: modelos, regras de status e formatação (usado no aparelho e no servidor).

export type KpiDirection = "HIGHER_BETTER" | "LOWER_BETTER";
export type KpiStatus = "red" | "amber" | "green" | "none";

export type KpiTemplate = {
  key: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  target: number;
  sectorSlug: string; // setor sugerido
  hint: string;
};

/** Os 11 modelos da caldeiraria (dá para ajustar tudo depois de criar). */
export const KPI_TEMPLATES: KpiTemplate[] = [
  { key: "otd", name: "OTD", unit: "%", direction: "HIGHER_BETTER", target: 95, sectorSlug: "producao", hint: "Entregas no prazo ÷ entregas do mês" },
  { key: "retrabalho", name: "Horas de retrabalho", unit: "h", direction: "LOWER_BETTER", target: 100, sectorSlug: "qualidade", hint: "Horas apontadas em retrabalho no mês" },
  { key: "refugo", name: "Índice de refugo", unit: "%", direction: "LOWER_BETTER", target: 1.5, sectorSlug: "qualidade", hint: "Material refugado ÷ material processado" },
  { key: "produtividade", name: "Produtividade", unit: "kg/Hh", direction: "HIGHER_BETTER", target: 18, sectorSlug: "producao", hint: "Kg produzidos ÷ homem-hora" },
  { key: "backlog-rs", name: "Backlog em R$", unit: "R$", direction: "HIGHER_BETTER", target: 4000000, sectorSlug: "comercial", hint: "Carteira de pedidos a faturar" },
  { key: "backlog-h", name: "Backlog em horas", unit: "h", direction: "HIGHER_BETTER", target: 12000, sectorSlug: "pcp", hint: "Horas de fabricação em carteira" },
  { key: "ncs", name: "NCs abertas", unit: "un", direction: "LOWER_BETTER", target: 5, sectorSlug: "qualidade", hint: "Não conformidades em aberto no fim do mês" },
  { key: "dias-sem-acidente", name: "Dias sem acidente", unit: "dias", direction: "HIGHER_BETTER", target: 180, sectorSlug: "sesmt", hint: "Dias desde o último acidente com afastamento" },
  { key: "absenteismo", name: "Absenteísmo", unit: "%", direction: "LOWER_BETTER", target: 3, sectorSlug: "rh", hint: "Horas de ausência ÷ horas previstas" },
  { key: "prazo-compras", name: "Prazo médio de compras", unit: "dias", direction: "LOWER_BETTER", target: 12, sectorSlug: "suprimentos", hint: "Da requisição à entrega do material" },
  { key: "giro-estoque", name: "Giro de estoque", unit: "vezes/ano", direction: "HIGHER_BETTER", target: 6, sectorSlug: "almoxarifado", hint: "Consumo anual ÷ estoque médio" },
];

export const UNIT_CHOICES = ["%", "un", "h", "dias", "R$", "kg", "t", "kg/Hh", "vezes/ano", "m²"];

/** Quanto o valor está fora da meta, em % (0 = dentro). */
export function offPercent(value: number | null, target: number, direction: KpiDirection) {
  if (value === null) return 0;
  if (target === 0) return direction === "LOWER_BETTER" && value > 0 ? 100 : 0;
  if (direction === "LOWER_BETTER" && value > target) return ((value - target) / Math.abs(target)) * 100;
  if (direction === "HIGHER_BETTER" && value < target) return ((target - value) / Math.abs(target)) * 100;
  return 0;
}

/** Semáforo: vermelho acima do limite (padrão 10%), amarelo fora mas perto, verde no alvo. */
export function statusOf(value: number | null, target: number, direction: KpiDirection, redPct = 10): KpiStatus {
  if (value === null) return "none";
  const off = offPercent(value, target, direction);
  if (off > redPct) return "red";
  if (off > 0) return "amber";
  return "green";
}

export const STATUS_LABEL: Record<KpiStatus, string> = { red: "Fora do alvo", amber: "Perto do limite", green: "No alvo", none: "Sem lançamento" };
export const STATUS_COLOR: Record<KpiStatus, string> = {
  red: "var(--red-solid)",
  amber: "var(--amber-solid)",
  green: "var(--green-solid)",
  none: "var(--fg-3)",
};
export const STATUS_TEXT: Record<KpiStatus, string> = { red: "text-red", amber: "text-amber", green: "text-green", none: "text-fg-3" };

export function fmtKpi(v: number | null, unit: string, compact = false) {
  if (v === null || Number.isNaN(v)) return "—";
  if (unit === "R$") {
    if (compact && Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (compact && Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  if (compact && Math.abs(v) >= 1e4) return `${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: unit === "%" ? 1 : 2 });
}

/** Sufixo da unidade depois do número ("%" colado; outros com espaço; R$ já vem no número). */
export function unitSuffix(unit: string) {
  if (unit === "R$") return "";
  if (unit === "%") return "%";
  return ` ${unit}`;
}

export const alvoSymbol = (d: KpiDirection) => (d === "LOWER_BETTER" ? "≤" : "≥");

// ---------- meses ("2026-09") ----------

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function monthOf(iso: string) {
  return iso.slice(0, 7);
}
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthShort(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MES[m - 1]}/${String(y).slice(2)}`;
}
export function monthLong(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MES_LONGO[m - 1].charAt(0).toUpperCase()}${MES_LONGO[m - 1].slice(1)} de ${y}`;
}

/** Mês sugerido para lançar: o atual a partir do dia 25; antes disso, o anterior (que acabou de fechar). */
export function launchMonth(today: string) {
  const day = Number(today.slice(8, 10));
  return day >= 25 ? monthOf(today) : addMonths(monthOf(today), -1);
}
