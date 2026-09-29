import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getKpiSnapshots } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { launchMonth } from "@/lib/kpi";
import { LaunchView } from "./launch-view";

export const metadata: Metadata = { title: "Lançar resultados" };

export default async function LaunchPage({ searchParams }: PageProps<"/metas/lancar">) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : launchMonth(todayISO());
  const kpis = await getKpiSnapshots(user.id);
  return (
    <div className="mx-auto max-w-[820px] md:px-7 md:pt-6">
      <div className="px-2 pt-1 md:px-0">
        <Link href="/metas" className="inline-flex h-11 items-center gap-0.5 px-2 text-[17px] font-medium text-ac-text md:px-0 md:text-[14px]">
          <ChevronLeft className="size-[22px] md:size-4" /> Metas
        </Link>
      </div>
      <LaunchView key={month} kpis={kpis} month={month} />
    </div>
  );
}
