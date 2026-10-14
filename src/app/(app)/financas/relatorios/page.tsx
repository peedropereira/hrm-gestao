import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/dates";
import { addMonth } from "@/lib/fin-types";
import { getReportTx } from "@/lib/finance";
import { RelatoriosView, type Period } from "./relatorios-view";

export const metadata: Metadata = { title: "Relatórios financeiros" };

const PERIODS: Period[] = ["3", "6", "12", "ano", "ano-1"];

/** Primeiro e último mês do período escolhido. */
function range(p: Period, current: string): [string, string] {
  const y = Number(current.slice(0, 4));
  if (p === "ano") return [`${y}-01`, current];
  if (p === "ano-1") return [`${y - 1}-01`, `${y - 1}-12`];
  return [addMonth(current, -(Number(p) - 1)), current];
}

export default async function RelatoriosPage({ searchParams }: PageProps<"/financas/relatorios">) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = (PERIODS as string[]).includes(String(sp.p)) ? (sp.p as Period) : "6";
  const current = todayISO().slice(0, 7);
  const [from, to] = range(period, current);
  // período anterior do mesmo tamanho, para comparar
  const len = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5)) + 1;
  const prevFrom = addMonth(from, -len);
  const rows = await getReportTx(user.id, prevFrom, addMonth(to, 1));
  return <RelatoriosView period={period} from={from} to={to} prevFrom={prevFrom} rows={rows} current={current} />;
}
