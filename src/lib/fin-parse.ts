// Lançamento rápido por texto ou voz:
//   "mercado 230,50"            → despesa de R$ 230,50 em Supermercado, hoje
//   "gasolina 250 ontem nubank" → Combustível, ontem, conta/cartão "Nubank"
//   "tv 3000 em 10x no cartão"  → compra parcelada em 10 vezes
//   "recebi salário 12.000 dia 5" → receita

import { addDaysISO } from "./dates";
import { norm } from "./nl-parse";
import { CATEGORY_HINTS } from "./fin-defaults";
import { parseMoney, type FinAccountDTO, type FinCategoryDTO } from "./fin-types";

export type FinParsed = {
  kind: "EXPENSE" | "INCOME";
  description: string;
  amount: number | null;
  date: string;
  categoryId: string | null;
  accountId: string | null;
  installments: number;
  paid: boolean;
};

export function parseFin(raw: string, ctx: { today: string; categories: FinCategoryDTO[]; accounts: FinAccountDTO[] }): FinParsed {
  let s = ` ${raw.replace(/\s+/g, " ").trim()} `;
  const n0 = norm(s);
  const r: FinParsed = { kind: "EXPENSE", description: "", amount: null, date: ctx.today, categoryId: null, accountId: null, installments: 1, paid: true };

  if (/\b(recebi|receber|recebimento|entrada|salario|plr|bonus|rendimento|reembolso|restituicao|vendi)\b/.test(n0)) r.kind = "INCOME";
  if (/\b(vou pagar|a pagar|vence|vencimento|pendente)\b/.test(n0)) r.paid = false;

  const cut = (m: RegExpMatchArray) => {
    s = `${s.slice(0, m.index!)} ${s.slice(m.index! + m[0].length)}`;
  };

  // parcelas: "em 10x", "10 vezes"
  {
    const m = norm(s).match(/\b(?:em )?(\d{1,2}) ?(?:x|vezes|parcelas)\b/);
    if (m && m.index !== undefined) {
      r.installments = Math.max(1, Math.min(48, Number(m[1])));
      cut(m);
    }
  }

  // data: hoje, ontem, anteontem, amanhã, dia 5, 05/10
  {
    const n = norm(s);
    const tests: [RegExp, (m: RegExpMatchArray) => string | null][] = [
      [/\banteontem\b/, () => addDaysISO(ctx.today, -2)],
      [/\bontem\b/, () => addDaysISO(ctx.today, -1)],
      [/\bhoje\b/, () => ctx.today],
      [/\bamanha\b/, () => addDaysISO(ctx.today, 1)],
      [
        /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
        (m) => {
          const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : ctx.today.slice(0, 4);
          return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        },
      ],
      [/\b(?:no |para o |pro )?dia (\d{1,2})\b/, (m) => `${ctx.today.slice(0, 7)}-${m[1].padStart(2, "0")}`],
    ];
    for (const [re, fn] of tests) {
      const m = n.match(re);
      if (m && m.index !== undefined) {
        const d = fn(m);
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
          r.date = d;
          cut(m);
          break;
        }
      }
    }
    if (r.date > ctx.today && r.paid) r.paid = false;
  }

  // valor: "230", "230,50", "R$ 1.200", "12 mil"
  {
    const n = norm(s);
    const mil = n.match(/\b(\d+(?:[.,]\d+)?) ?mil\b/);
    const m = mil ?? n.match(/(?:r\$ ?)?\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+\.\d{1,2})\b(?: reais)?/);
    if (m && m.index !== undefined) {
      const v = parseMoney(m[1]);
      if (v !== null) {
        r.amount = mil ? v * 1000 : v;
        cut(m);
      }
    }
  }

  // conta ou cartão pelo nome ("nubank", "itaú", "no cartão")
  {
    const n = norm(s);
    let best: { id: string; len: number; m: RegExpMatchArray } | null = null;
    for (const a of ctx.accounts.filter((x) => !x.archived)) {
      const key = norm(a.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = n.match(new RegExp(`(?:\\b(?:no|na|pelo|pela|com o|com a|do|da)\\s+)?\\b${key}\\b`));
      if (m && m.index !== undefined && (!best || key.length > best.len)) best = { id: a.id, len: key.length, m };
    }
    if (best) {
      r.accountId = best.id;
      cut(best.m);
    } else {
      const m = n.match(/\b(?:no |pelo |com o )?cartao(?: de credito)?\b/);
      if (m && m.index !== undefined) {
        r.accountId = ctx.accounts.find((a) => a.type === "CREDIT_CARD" && !a.archived)?.id ?? null;
        cut(m);
      }
      const pix = norm(s).match(/\b(?:no |via )?(pix|debito|dinheiro)\b/);
      if (pix && pix.index !== undefined) {
        if (pix[1] === "dinheiro") r.accountId = ctx.accounts.find((a) => a.type === "CASH" && !a.archived)?.id ?? null;
        cut(pix);
      }
    }
  }

  // limpa verbos e conectivos
  let d = s
    .replace(/\b(gastei|paguei|comprei|recebi|vou pagar|pagar|conta de|conta da|conta do)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(com|de|no|na|em|o|a)\s+/i, "")
    .replace(/\s+(com|de|no|na|em|e)$/i, "")
    .trim();
  if (!d) d = r.kind === "INCOME" ? "Receita" : "Despesa";
  r.description = d.charAt(0).toUpperCase() + d.slice(1);

  // categoria: dicas de palavras, depois nome da categoria no texto
  const pool = ctx.categories.filter((c) => !c.archived && c.kind === r.kind);
  const n = norm(raw);
  for (const [re, name] of CATEGORY_HINTS) {
    if (re.test(n)) {
      const c = pool.find((x) => x.name === name);
      if (c) {
        r.categoryId = c.id;
        break;
      }
    }
  }
  if (!r.categoryId) {
    const nd = norm(r.description);
    const c = pool.find((x) => norm(x.name).split(/[\s/]+/).some((w) => w.length > 3 && new RegExp(`\\b${w}\\b`).test(nd)));
    if (c) r.categoryId = c.id;
  }
  return r;
}

export type FixedLine = { description: string; amount: number | null; dayOfMonth: number; categoryId: string | null; kind: "EXPENSE" | "INCOME"; variable: boolean; raw: string };

/**
 * Lê uma lista colada de gastos fixos, uma linha por item, em qualquer formato comum:
 *   "Aluguel - R$ 2.500,00 - dia 05"   "Condomínio 850 venc 10"   "Luz ~300 (varia)"
 */
export function parseFixedList(text: string, categories: FinCategoryDTO[]): FixedLine[] {
  const out: FixedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s\-*•·\d.)]+(?=\D)/, "").trim();
    if (!line || line.length < 2) continue;
    let s = ` ${line} `;
    const n = () => norm(s);
    let day = 5;
    const dm = n().match(/\b(?:dia|vence|venc\.?|vencimento|todo dia)\s*(\d{1,2})\b/);
    if (dm && dm.index !== undefined) {
      day = Math.min(31, Math.max(1, Number(dm[1])));
      s = `${s.slice(0, dm.index)} ${s.slice(dm.index + dm[0].length)}`;
    }
    const variable = /\b(varia|variavel|aprox|aproximadamente|media|em media|cerca de)\b|~/.test(n());
    const kind: "EXPENSE" | "INCOME" = /\b(salario|receita|recebo|renda|plr|aluguel recebido)\b/.test(n()) ? "INCOME" : "EXPENSE";
    // valor: o último número com cara de dinheiro
    const moneyRe = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})|\d+(?:\.\d{1,2})?)(?!\s*(?:x|%|º|o\b))/g;
    let amount: number | null = null;
    let last: RegExpExecArray | null = null;
    for (let m = moneyRe.exec(n()); m; m = moneyRe.exec(n())) last = m;
    if (last) {
      amount = parseMoney(last[1]);
      s = `${s.slice(0, last.index)} ${s.slice(last.index + last[0].length)}`;
    }
    let description = s
      .replace(/\(?\b(varia|variável|variavel|aprox\.?|aproximadamente|média|em média|cerca de)\b\)?|~|r\$/gi, " ")
      .replace(/[:=|;]+/g, " ")
      .replace(/\s[-–—]\s/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[-–—,.]+|[-–—,.]+$/g, "")
      .trim();
    if (!description) description = "Gasto fixo";
    description = description.charAt(0).toUpperCase() + description.slice(1);
    const nd = norm(description);
    const pool = categories.filter((c) => !c.archived && c.kind === kind);
    let categoryId: string | null = null;
    for (const [re, name] of CATEGORY_HINTS) {
      if (re.test(nd)) {
        categoryId = pool.find((c) => c.name === name)?.id ?? null;
        if (categoryId) break;
      }
    }
    if (!categoryId) categoryId = pool.find((c) => norm(c.name).split(/[\s/]+/).some((w) => w.length > 3 && nd.includes(w)))?.id ?? null;
    out.push({ description, amount, dayOfMonth: day, categoryId, kind, variable, raw: line });
  }
  return out;
}

/** Categoria provável pela descrição (dicas de palavras, depois nome da categoria). */
export function guessCategory(description: string, categories: FinCategoryDTO[], kind: "EXPENSE" | "INCOME" = "EXPENSE") {
  const pool = categories.filter((c) => !c.archived && c.kind === kind);
  const n = norm(description);
  for (const [re, name] of CATEGORY_HINTS) {
    if (re.test(n)) {
      const c = pool.find((x) => x.name === name);
      if (c) return c.id;
    }
  }
  return pool.find((x) => norm(x.name).split(/[\s/]+/).some((w) => w.length > 3 && new RegExp(`\\b${w}\\b`).test(n)))?.id ?? null;
}
