import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/dates";
import { ensureRecurring, getMonthTx } from "@/lib/finance";
import { LancView } from "./lanc-view";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function LancPage({ searchParams }: PageProps<"/financas/lancamentos">) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : todayISO().slice(0, 7);
  await ensureRecurring(user.id, [month]);
  const txs = await getMonthTx(user.id, month);
  return <LancView month={month} txs={txs} />;
}
