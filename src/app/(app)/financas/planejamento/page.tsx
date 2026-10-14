import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/dates";
import { addMonth } from "@/lib/fin-types";
import { ensureRecurring, getAccounts, getGoals, getInstallmentPlans, getMonthRemaining, getProjection, getReportTx } from "@/lib/finance";
import { PlanejamentoView } from "./planejamento-view";

export const metadata: Metadata = { title: "Planejamento financeiro" };

export default async function PlanejamentoPage({ searchParams }: PageProps<"/financas/planejamento">) {
  const user = await requireUser();
  const sp = await searchParams;
  const horizon = sp.h === "12" ? 12 : 6;
  const month = todayISO().slice(0, 7);
  await ensureRecurring(user.id, [month, addMonth(month, 1)]);
  const [{ accounts }, remaining, projection, installments, goals, recent] = await Promise.all([
    getAccounts(user.id),
    getMonthRemaining(user.id, month),
    getProjection(user.id, month, horizon),
    getInstallmentPlans(user.id, month),
    getGoals(user.id),
    getReportTx(user.id, addMonth(month, -3), month),
  ]);
  return <PlanejamentoView month={month} horizon={horizon} accounts={accounts} remaining={remaining} projection={projection} installments={installments} goals={goals} recent={recent} />;
}
