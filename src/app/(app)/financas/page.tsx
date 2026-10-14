import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/dates";
import { addMonth } from "@/lib/fin-types";
import { ensureRecurring, getAccounts, getHistory, getMonthTx, getOpenItems, getReportTx } from "@/lib/finance";
import { PainelView } from "./painel-view";

export const metadata: Metadata = { title: "Finanças" };

export default async function FinancePage({ searchParams }: PageProps<"/financas">) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : todayISO().slice(0, 7);
  await ensureRecurring(user.id, [month, addMonth(month, 1)]);
  const [txs, open, history, { accounts, invoices }, recent] = await Promise.all([
    getMonthTx(user.id, month),
    getOpenItems(user.id, month),
    getHistory(user.id, month),
    getAccounts(user.id),
    getReportTx(user.id, addMonth(month, -3), addMonth(month, 1)),
  ]);
  return <PainelView month={month} txs={txs} open={open} history={history} accounts={accounts} invoices={invoices} recent={recent} />;
}
