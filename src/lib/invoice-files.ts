import "server-only";
import { norm } from "@/lib/nl-parse";
import { parseInvoiceFromText, parseInvoicePdf, parseImageWithClaude, splitInstallment, type InvoiceLine, type InvoiceParse } from "@/lib/invoice-pdf";

// Importação de fatura a partir de qualquer arquivo comum:
// PDF, CSV (Nubank, Inter, C6, Itaú…), OFX/QFX (exportação padrão dos bancos), Excel (.xlsx), TXT e foto/print.

export type FileKind = "pdf" | "csv" | "ofx" | "xlsx" | "txt" | "imagem";

export function kindOf(name: string, type: string): FileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "ofx" || ext === "qfx" || /ofx/.test(type)) return "ofx";
  if (ext === "csv" || /csv/.test(type)) return "csv";
  if (ext === "xlsx" || /spreadsheetml/.test(type)) return "xlsx";
  if (ext === "txt" || type === "text/plain") return "txt";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "imagem";
  return null;
}

/** Texto em UTF-8; se vier com caracteres quebrados, tenta Latin-1 (comum em CSV de banco). */
function decode(buf: Uint8Array) {
  const utf = new TextDecoder("utf-8").decode(buf);
  return utf.includes("�") ? new TextDecoder("latin1").decode(buf) : utf;
}

const SKIP = /\b(pagamento|pgto|pagto|deb(?:ito)?\.? em c\/?c|debito em conta|pag(?:amento)? fatura|pag(?:to)?\s+efetuado|pagamento recebido|saldo anterior|total d|limite)\b/i;
const CREDIT = /\b(estorno|credito|crédito|reembolso|cashback|devolu)/i;

// ---------- valores e datas ----------

function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().replace(/\s|R\$|BRL/gi, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  // 1.234,56 (BR) ou 1,234.56 / 1234.56 (US)
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function parseDate(v: unknown, invoice: string): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) {
    // data serial do Excel
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (m) {
    const [iy, im] = invoice.split("-").map(Number);
    const mo = Number(m[2]);
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : mo > im + 1 ? iy - 1 : iy;
    if (mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// ---------- tabelas (CSV / Excel) ----------

function splitCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 5).join("\n");
  const delim = [";", "\t", ","].map((d) => ({ d, n: sample.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (c === delim && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  });
}

const COL = {
  date: /^(data|date|dt|data (da )?(compra|transacao|lancamento|movimento))$/,
  desc: /^(descricao|description|title|titulo|historico|estabelecimento|lancamento|detalhe|detalhes|memo|nome|item)$/,
  amount: /^(valor|amount|value|valor \(r\$\)|valor r\$|valor em r\$|quantia|total)$/,
  credit: /^(credito|entrada)$/,
  debit: /^(debito|saida)$/,
  installment: /^(parcela|parcelas|installment)$/,
};

/** Converte linhas de tabela em compras: acha o cabeçalho e as colunas de data, descrição e valor. */
export function parseRows(rows: unknown[][], invoice: string): InvoiceParse | null {
  const headerIdx = rows.slice(0, 15).findIndex((r) => {
    const h = r.map((c) => norm(String(c ?? "")).trim());
    return h.some((x) => COL.date.test(x)) && h.some((x) => COL.amount.test(x) || COL.debit.test(x));
  });
  if (headerIdx < 0) return null;
  const head = rows[headerIdx].map((c) => norm(String(c ?? "")).trim());
  const find = (re: RegExp) => head.findIndex((x) => re.test(x));
  const iDate = find(COL.date);
  const iDesc = find(COL.desc);
  const iAmount = find(COL.amount);
  const iCredit = find(COL.credit);
  const iDebit = find(COL.debit);
  const iInst = find(COL.installment);

  const raw: { date: string; desc: string; value: number; inst: string | null }[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[iDate], invoice);
    if (!date) continue;
    let value: number | null;
    if (iAmount >= 0) value = parseAmount(r[iAmount]);
    else {
      const d = parseAmount(r[iDebit]) ?? 0;
      const c = parseAmount(r[iCredit]) ?? 0;
      value = Math.abs(d) - Math.abs(c);
    }
    if (value == null || value === 0) continue;
    const desc = iDesc >= 0 ? String(r[iDesc] ?? "").trim() : r.filter((c, j) => j !== iDate && j !== iAmount && typeof c === "string").join(" ").trim();
    const instCell = iInst >= 0 ? String(r[iInst] ?? "").trim() : "";
    raw.push({ date, desc: desc || "Compra", value, inst: /\d+\s*\/\s*\d+/.test(instCell) ? instCell.replace(/\s/g, "") : null });
  }
  if (!raw.length) return null;
  // sinal das compras: o mais comum no arquivo (Nubank: compras positivas; extratos: compras negativas)
  const purchasesPositive = raw.filter((x) => x.value > 0).length >= raw.filter((x) => x.value < 0).length;
  const lines: InvoiceLine[] = [];
  for (const x of raw) {
    if (SKIP.test(x.desc)) continue;
    const isPurchase = purchasesPositive ? x.value > 0 : x.value < 0;
    const credit = !isPurchase || CREDIT.test(x.desc);
    let desc = x.desc;
    let installment = x.inst;
    const sp = splitInstallment(desc);
    desc = sp.desc;
    installment = installment ?? sp.installment;
    lines.push({ date: x.date, description: installment ? `${desc} (${installment})` : desc, amount: Math.round(Math.abs(x.value) * 100) / 100, credit, installment });
  }
  return { lines, total: null, source: "texto" };
}

// ---------- OFX ----------

export function parseOfx(text: string, invoice: string): InvoiceParse {
  const lines: InvoiceLine[] = [];
  const tag = (block: string, t: string) => block.match(new RegExp(`<${t}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const vals = blocks.map((b) => parseAmount(tag(b, "TRNAMT").replace(",", ".")) ?? 0);
  // em fatura de cartão as compras costumam vir negativas
  const purchasesNegative = vals.filter((v) => v < 0).length >= vals.filter((v) => v > 0).length;
  blocks.forEach((b, i) => {
    const v = vals[i];
    if (!v) return;
    const d = tag(b, "DTPOSTED");
    const date = /^\d{8}/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : parseDate(d, invoice);
    if (!date) return;
    const desc = (tag(b, "MEMO") || tag(b, "NAME") || "Compra").replace(/\s+/g, " ");
    if (SKIP.test(desc)) return;
    const isPurchase = purchasesNegative ? v < 0 : v > 0;
    lines.push({ date, description: desc, amount: Math.round(Math.abs(v) * 100) / 100, credit: !isPurchase || CREDIT.test(desc), installment: null });
  });
  return { lines, total: null, source: "texto" };
}

// ---------- entrada única ----------

export async function parseInvoiceFile(file: File, invoice: string): Promise<InvoiceParse & { kind: FileKind }> {
  const kind = kindOf(file.name, file.type);
  if (!kind) throw new Error("Formato não suportado. Use PDF, CSV, OFX, Excel (.xlsx), TXT ou foto da fatura.");
  const buf = new Uint8Array(await file.arrayBuffer());
  if (kind === "pdf") return { ...(await parseInvoicePdf(buf, invoice)), kind };
  if (kind === "imagem") {
    const r = await parseImageWithClaude(buf, file.type || "image/jpeg", invoice);
    if (!r) throw new Error("Para ler foto ou print da fatura é preciso a IA (ANTHROPIC_API_KEY na Vercel). Use PDF, CSV ou cole o texto.");
    return { ...r, kind };
  }
  if (kind === "xlsx") {
    const { default: readXlsxFile } = await import("read-excel-file/node");
    const sheets = await readXlsxFile(Buffer.from(buf));
    for (const s of sheets) {
      const r = parseRows(s.data as unknown[][], invoice);
      if (r?.lines.length) return { ...r, kind };
    }
    const text = sheets.map((s) => (s.data as unknown[][]).map((row) => row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))).join(" ")).join("\n")).join("\n");
    return { ...(await parseInvoiceFromText(text, invoice)), kind };
  }
  const text = decode(buf);
  if (kind === "ofx") return { ...parseOfx(text, invoice), kind };
  if (kind === "csv") {
    const r = parseRows(splitCsv(text), invoice);
    if (r?.lines.length) return { ...r, kind };
  }
  return { ...(await parseInvoiceFromText(text, invoice)), kind };
}
