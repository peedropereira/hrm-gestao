import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { dateOnlyToISO } from "@/lib/dates";
import { getCategories, monthDate } from "@/lib/finance";
import { addMonth } from "@/lib/fin-types";
import { guessCategory } from "@/lib/fin-parse";
import { norm } from "@/lib/nl-parse";
import { matchWindow, parseInvoicePdf } from "@/lib/invoice-pdf";

// Lê o PDF da fatura e devolve as compras, com categoria sugerida e os fixos que correspondem.
export const maxDuration = 60;

const words = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !["com", "br", "www", "parc", "das", "dos"].includes(w)));

export async function POST(req: Request) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const cardId = String(form.get("cardId") ?? "");
  const month = String(form.get("month") ?? "");
  if (!(file instanceof File) || !/pdf/i.test(file.type || file.name)) return NextResponse.json({ error: "Envie o arquivo PDF da fatura." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "PDF muito grande (máx. 4 MB)." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Escolha o mês da fatura." }, { status: 400 });
  const card = await db.finAccount.findFirst({ where: { id: cardId, ownerId, type: "CREDIT_CARD" } });
  if (!card) return NextResponse.json({ error: "Cartão não encontrado." }, { status: 400 });

  let parsed;
  try {
    parsed = await parseInvoicePdf(new Uint8Array(await file.arrayBuffer()), month);
  } catch (e) {
    console.error("PDF ilegível", e);
    return NextResponse.json({ error: "Não consegui ler este PDF. Se for uma foto/escaneado, a leitura precisa da IA (ANTHROPIC_API_KEY)." }, { status: 422 });
  }

  // fixos do cartão que podem estar nesta fatura
  const [from] = matchWindow(month);
  const candidates = await db.finTransaction.findMany({
    where: {
      ownerId,
      deletedAt: null,
      kind: "EXPENSE",
      OR: [
        { cardPending: true, date: { gte: monthDate(from), lt: monthDate(addMonth(month, 1)) } },
        { accountId: card.id, invoiceMonth: monthDate(month), recurringId: { not: null } },
      ],
    },
    orderBy: { date: "asc" },
  });
  const used = new Set<string>();
  const categories = await getCategories(ownerId);
  const lines = parsed.lines.map((l) => {
    let match: { txId: string; description: string; amount: number } | null = null;
    if (!l.credit) {
      const lw = words(l.description);
      const pool = candidates.filter((c) => !used.has(c.id));
      const scored = pool
        .map((c) => {
          const a = Number(c.amount);
          const same = Math.abs(a - l.amount) < 0.01;
          const close = Math.abs(a - l.amount) <= a * 0.15;
          const overlap = [...words(c.description)].some((w) => lw.has(w) || [...lw].some((x) => x.startsWith(w) || w.startsWith(x)));
          const uniqueAmount = same && pool.filter((p) => Math.abs(Number(p.amount) - l.amount) < 0.01).length === 1;
          const score = same && overlap ? 3 : close && overlap ? 2 : uniqueAmount ? 1 : 0;
          return { c, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored[0]) {
        used.add(scored[0].c.id);
        match = { txId: scored[0].c.id, description: scored[0].c.description, amount: Number(scored[0].c.amount) };
      }
    }
    return { ...l, categoryId: guessCategory(l.description, categories, l.credit ? "INCOME" : "EXPENSE"), match };
  });
  const pending = candidates.filter((c) => !used.has(c.id)).map((c) => ({ id: c.id, description: c.description, amount: Number(c.amount), date: dateOnlyToISO(c.date)! }));
  return NextResponse.json({ lines, total: parsed.total, source: parsed.source, pending });
}
