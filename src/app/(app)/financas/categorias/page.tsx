import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/dates";
import { ensureRecurring, getMonthTx } from "@/lib/finance";
import { CategoriasView } from "./categorias-view";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriasPage({ searchParams }: PageProps<"/financas/categorias">) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : todayISO().slice(0, 7);
  await ensureRecurring(user.id, [month]);
  const txs = await getMonthTx(user.id, month);
  const spent: Record<string, number> = {};
  for (const t of txs) if (t.categoryId && t.kind !== "TRANSFER") spent[t.categoryId] = (spent[t.categoryId] ?? 0) + t.amount;
  return <CategoriasView month={month} spent={spent} />;
}
