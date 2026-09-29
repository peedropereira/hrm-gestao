import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getKpiSnapshots } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { launchMonth } from "@/lib/kpi";
import { MetasView } from "./metas-view";

export const metadata: Metadata = { title: "Metas" };

export default async function MetasPage({ searchParams }: PageProps<"/metas">) {
  const user = await requireUser();
  const sp = await searchParams;
  const kpis = await getKpiSnapshots(user.id);
  const filter = typeof sp.f === "string" ? sp.f : "todas";
  return <MetasView kpis={kpis} month={launchMonth(todayISO())} filter={filter} />;
}
