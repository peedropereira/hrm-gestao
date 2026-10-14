// Tipos e utilidades das finanças (usados no aparelho e no servidor).

export type FinKind = "EXPENSE" | "INCOME" | "TRANSFER";
export type FinAccountType = "CHECKING" | "SAVINGS" | "CASH" | "CREDIT_CARD" | "INVESTMENT" | "OTHER";

export type FinAccountDTO = {
  id: string;
  name: string;
  type: FinAccountType;
  color: string;
  initialBalance: number;
  closingDay: number | null;
  dueDay: number | null;
  creditLimit: number | null;
  archived: boolean;
  balance: number; // cartão: negativo = valor em aberto
};

export type FinCategoryDTO = {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  group: string;
  icon: string;
  color: string;
  budget: number | null;
  archived: boolean;
};

export type FinTxDTO = {
  id: string;
  kind: FinKind;
  description: string;
  amount: number;
  date: string; // yyyy-mm-dd
  paid: boolean;
  paidAt: string | null;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  recurringId: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  installmentGroup: string | null;
  invoiceMonth: string | null; // yyyy-mm
  cardPending: boolean; // cobrado em cartão, aguardando a fatura
  notes: string | null;
};

export type FinRecurringDTO = {
  id: string;
  kind: "EXPENSE" | "INCOME";
  description: string;
  amount: number;
  categoryId: string | null;
  accountId: string | null;
  dayOfMonth: number;
  startMonth: string; // yyyy-mm
  endMonth: string | null;
  variable: boolean;
  autoPaid: boolean;
  onCard: boolean; // cobrado no cartão (paga só com a fatura)
  notes: string | null;
  active: boolean;
};

export type FinInvoiceDTO = {
  accountId: string;
  month: string; // yyyy-mm da fatura
  dueDate: string;
  total: number;
  paid: boolean;
  count: number;
};

export const ACCOUNT_TYPE_LABEL: Record<FinAccountType, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimentos",
  OTHER: "Outra",
};

export function brl(v: number, opts?: { sign?: boolean; compact?: boolean }) {
  if (opts?.compact && Math.abs(v) >= 10000) {
    return `${v < 0 ? "-" : ""}R$ ${(Math.abs(v) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  const s = Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (v < 0) return `-${s}`;
  return opts?.sign && v > 0 ? `+${s}` : s;
}

/** "1.234,56" → 1234.56; aceita "1234.56" e "R$ 50". */
export function parseMoney(s: string): number | null {
  const t = s.trim().replace(/\s|R\$/gi, "");
  if (!t) return null;
  let n: string;
  if (t.includes(",")) n = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, "");
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

export const moneyInput = (v: number | null | undefined) => (v == null ? "" : v.toFixed(2).replace(".", ","));

// ---------- meses ----------

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function addMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const monthName = (month: string) => `${MES_LONGO[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
export const monthAbbr = (month: string) => `${MES[Number(month.slice(5)) - 1]}/${month.slice(2, 4)}`;
export function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Data do dia N no mês (ajusta dia 31 em mês curto). */
export function dayInMonth(month: string, day: number) {
  return `${month}-${String(Math.min(day, lastDay(month))).padStart(2, "0")}`;
}

/**
 * Mês da fatura (= mês do vencimento) de uma compra no cartão.
 * Depois do fechamento, cai na fatura seguinte; se vence antes do dia do fechamento, vence no mês seguinte.
 */
export function invoiceMonthOf(date: string, closingDay: number | null, dueDay: number | null) {
  const month = date.slice(0, 7);
  const closing = closingDay ?? 1;
  const closeMonth = Number(date.slice(8, 10)) > closing ? addMonth(month, 1) : month;
  return dueDay && dueDay <= closing ? addMonth(closeMonth, 1) : closeMonth;
}

// ---------- relatórios ----------

/** Lançamento enxuto para relatórios (month = mês em que conta: fatura no cartão, data no resto). */
export type ReportTx = {
  kind: "EXPENSE" | "INCOME";
  amount: number;
  date: string;
  month: string;
  categoryId: string | null;
  description: string;
  recurring: boolean;
  installment: boolean;
  card: boolean;
  paid: boolean;
};

export type FinGoalDTO = {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string | null;
  color: string;
  icon: string;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  entries: { id: string; amount: number; date: string }[];
};

export type InstallmentPlan = {
  group: string;
  description: string;
  accountId: string | null;
  categoryId: string | null;
  perMonth: number;
  total: number;
  count: number;
  done: number; // parcelas em meses já passados
  remaining: number; // valor que ainda falta
  lastMonth: string;
};

export type ProjectionMonth = {
  month: string;
  income: number;
  expense: number;
  fixed: number; // despesas fixas
  installments: number; // parcelas
};

export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonth(m, 1)) out.push(m);
  return out;
}
