import "server-only";

import { addMonth } from "@/lib/fin-types";

// Leitura de fatura de cartão em PDF.
// - Com ANTHROPIC_API_KEY: o Claude lê o PDF (funciona com qualquer banco e com PDF escaneado).
// - Sem a chave: extrai o texto do PDF e reconhece as linhas "dd/mm DESCRIÇÃO 123,45".

export type InvoiceLine = { date: string; description: string; amount: number; credit: boolean; installment: string | null };
export type InvoiceParse = { lines: InvoiceLine[]; total: number | null; source: "ia" | "texto" };

const SKIP = /\b(pagamento|pgto|pag(?:to)?\s+efetuado|saldo anterior|total d|total a pagar|limite|encargos? (?:de|do) financiamento|juros do rotativo|vencimento|fechamento|cotacao|iof total)\b/i;

/** Ano da compra: meses depois do mês da fatura são do ano anterior. */
function fullDate(dd: string, mm: string, invoice: string) {
  const [iy, im] = invoice.split("-").map(Number);
  const m = Number(mm);
  const y = m > im + 1 ? iy - 1 : iy;
  return `${y}-${String(m).padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

const MES: Record<string, string> = { JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06", JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12" };

function money(s: string) {
  return Number(s.replace(/[^\d,-]/g, "").replace(",", "."));
}

export function parseInvoiceText(text: string, invoice: string): InvoiceParse {
  const lines: InvoiceLine[] = [];
  const t = text.replace(/ /g, " ");
  const re = /(\d{2})(?:\s*[/.-]\s*(\d{2})|\s*[/.-]?\s*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ))\b\s+(.{3,90}?)\s+(-\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(\s*-)?(?=\s|$)/gi;
  for (const m of t.matchAll(re)) {
    const mm = m[2] ?? MES[(m[3] ?? "").toUpperCase()];
    if (!mm || Number(mm) > 12 || Number(m[1]) > 31) continue;
    let desc = m[4].replace(/\s+/g, " ").trim();
    if (SKIP.test(desc)) continue;
    const inst = desc.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i);
    let installment: string | null = null;
    if (inst && Number(inst[1]) <= Number(inst[2])) {
      installment = `${inst[1]}/${inst[2]}`;
      desc = desc.slice(0, inst.index).trim();
    }
    const amount = money(m[6]);
    if (!amount) continue;
    const credit = !!(m[5] || m[7]) || /\b(estorno|credito|crédito|reembolso|cashback)\b/i.test(desc);
    lines.push({ date: fullDate(m[1], mm, invoice), description: installment ? `${desc} (${installment})` : desc, amount, credit, installment });
  }
  const tot = t.match(/total\s+(?:da\s+fatura|a\s+pagar|desta\s+fatura)[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return { lines, total: tot ? money(tot[1]) : null, source: "texto" };
}

/**
 * Texto copiado do app/site do banco, linha a linha: a data pode vir sozinha numa linha
 * ("12 OUT", "12/10", "Hoje") e a compra embaixo ("Netflix.com  R$ 59,90" ou nome numa linha e valor na outra).
 */
export function parseInvoiceLoose(text: string, invoice: string): InvoiceParse {
  const rows = text.replace(/ /g, " ").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const lines: InvoiceLine[] = [];
  const firstDay = `${addMonth(invoice, -1)}-01`;
  let date = firstDay;
  let pendingDesc = "";
  const dateOnly = /^(\d{1,2})\s*(?:[/.-]\s*(\d{1,2})|[/.-]?\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?)(?:\s*[/.-]?\s*\d{2,4})?$/i;
  const moneyEnd = /^(.*?)\s*(-\s*)?(?:R\$\s*)?(-\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(\s*-)?$/i;
  for (const row of rows) {
    const d = row.match(dateOnly);
    if (d) {
      const mm = d[2] ?? MES[(d[3] ?? "").slice(0, 3).toUpperCase()];
      if (mm && Number(mm) <= 12 && Number(d[1]) <= 31) date = fullDate(d[1], mm, invoice);
      pendingDesc = "";
      continue;
    }
    const m = row.match(moneyEnd);
    if (!m) {
      // nome do estabelecimento numa linha, valor na próxima
      if (!/^\d+$/.test(row) && row.length <= 80) pendingDesc = row;
      continue;
    }
    let desc = (m[1] || pendingDesc).replace(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s+/, (_, dd, mo) => {
      if (Number(mo) <= 12) date = fullDate(dd, mo, invoice);
      return "";
    });
    pendingDesc = "";
    desc = desc.trim();
    if (!desc || SKIP.test(desc)) continue;
    const amount = money(m[4]);
    if (!amount) continue;
    const inst = desc.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i);
    let installment: string | null = null;
    if (inst && Number(inst[1]) <= Number(inst[2])) {
      installment = `${inst[1]}/${inst[2]}`;
      desc = desc.slice(0, inst.index).trim();
    }
    const credit = !!(m[2] || m[3] || m[5]) || /\b(estorno|credito|crédito|reembolso|cashback)\b/i.test(desc);
    lines.push({ date, description: installment ? `${desc} (${installment})` : desc, amount, credit, installment });
  }
  return { lines, total: null, source: "texto" };
}

/** Texto colado: tenta o formato de fatura, depois o formato do app, e por fim a IA (se houver chave). */
export async function parseInvoiceFromText(text: string, invoice: string): Promise<InvoiceParse> {
  const strict = parseInvoiceText(text, invoice);
  const loose = parseInvoiceLoose(text, invoice);
  const best = loose.lines.length > strict.lines.length ? { ...loose, total: strict.total } : strict;
  if (best.lines.length) return best;
  const ai = await parseTextWithClaude(text, invoice);
  return ai ?? best;
}

async function extractPdfText(buf: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

const TOOL = {
  name: "registrar_fatura",
  description: "Registra as compras de uma fatura de cartão de crédito.",
  input_schema: {
    type: "object",
    properties: {
      total: { type: ["number", "null"], description: "Total da fatura a pagar." },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            data: { type: "string", description: "Data da compra yyyy-mm-dd." },
            descricao: { type: "string", description: "Estabelecimento como aparece, sem a parcela." },
            valor: { type: "number", description: "Valor positivo desta fatura (em parcelados, só a parcela)." },
            credito: { type: "boolean", description: "true para estorno, crédito ou devolução (abate da fatura)." },
            parcela: { type: ["string", "null"], description: "ex.: 2/10, ou null." },
          },
          required: ["data", "descricao", "valor", "credito", "parcela"],
        },
      },
    },
    required: ["total", "itens"],
  },
} as const;

const parseWithClaude = (buf: Uint8Array, invoice: string) =>
  askClaude({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(buf).toString("base64") } }, invoice);

/** Foto ou print da fatura (precisa de ANTHROPIC_API_KEY). */
export const parseImageWithClaude = (buf: Uint8Array, mediaType: string, invoice: string) =>
  ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)
    ? askClaude({ type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(buf).toString("base64") } }, invoice)
    : Promise.resolve(null);

const parseTextWithClaude = (text: string, invoice: string) => askClaude({ type: "text", text: `Texto copiado da fatura:\n\n${text.slice(0, 60000)}` }, invoice);

async function askClaude(source: Record<string, unknown>, invoice: string): Promise<InvoiceParse | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_ATA || "claude-sonnet-5-5",
        max_tokens: 8000,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "registrar_fatura" },
        messages: [
          {
            role: "user",
            content: [
              source,
              {
                type: "text",
                text: `Fatura de cartão com vencimento em ${invoice}. Liste todas as compras e créditos lançados nesta fatura (de todos os cartões adicionais). Não inclua o pagamento da fatura anterior, saldo anterior, limites nem totais. Datas sem ano: use o ano coerente com o vencimento.`,
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("fatura IA falhou", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { content?: { type: string; input?: { total: number | null; itens: { data: string; descricao: string; valor: number; credito: boolean; parcela: string | null }[] } }[] };
    const input = json.content?.find((c) => c.type === "tool_use")?.input;
    if (!input?.itens?.length) return null;
    const lines = input.itens
      .filter((i) => i.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(i.data))
      .map((i) => ({
        date: i.data,
        description: i.parcela ? `${i.descricao.trim()} (${i.parcela})` : i.descricao.trim(),
        amount: Math.round(Math.abs(i.valor) * 100) / 100,
        credit: !!i.credito,
        installment: i.parcela,
      }));
    return { lines, total: input.total ?? null, source: "ia" };
  } catch (e) {
    console.error("fatura IA indisponível", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseInvoicePdf(buf: Uint8Array, invoice: string): Promise<InvoiceParse> {
  const ai = await parseWithClaude(buf, invoice);
  if (ai) return ai;
  const text = await extractPdfText(buf);
  return parseInvoiceText(text, invoice);
}

/** Meses em que um fixo pode cair nesta fatura (compra até 2 meses antes do vencimento). */
export const matchWindow = (invoice: string) => [addMonth(invoice, -2), invoice] as const;
