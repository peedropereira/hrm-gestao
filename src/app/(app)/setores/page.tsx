import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getPeople, getSectorHealth, getSectors } from "@/lib/data";
import { Card, HealthLabel, SectorTile } from "@/components/ds";
import { NewSectorButton } from "./sector-forms";

export const metadata: Metadata = { title: "Setores" };

export default async function SectorsPage() {
  const user = await requireUser();
  const [sectors, health, people] = await Promise.all([getSectors(user.id), getSectorHealth(user.id, user.id), getPeople(user.id)]);
  const hmap = new Map(health.map((h) => [h.sectorId, h]));
  const order = { red: 0, amber: 1, green: 2 } as const;
  const top = sectors
    .filter((s) => !s.parentId && s.active)
    .sort((a, b) => order[hmap.get(a.id)?.status ?? "green"] - order[hmap.get(b.id)?.status ?? "green"] || a.order - b.order);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="flex items-end justify-between gap-3 px-5 pb-3 pt-3 md:px-7 md:pt-6">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Setores</h1>
          <p className="text-[15px] font-medium text-fg-3 md:text-[14px]">
            {health.filter((h) => h.status === "red").length} críticos · {health.filter((h) => h.status === "amber").length} em atenção ·{" "}
            {health.filter((h) => h.status === "green").length} em dia
          </p>
        </div>
        <NewSectorButton />
      </header>
      <div className="grid gap-2.5 px-4 md:grid-cols-2 md:gap-3 md:px-7 lg:grid-cols-3">
        {top.map((s) => {
          const h = hmap.get(s.id);
          const leader = people.find((p) => p.sectorId === s.id && p.isLeader);
          const subs = sectors.filter((x) => x.parentId === s.id);
          return (
            <Link key={s.id} href={`/setores/${s.slug}`} className="block">
              <Card className="flex h-full items-start gap-3 p-3.5 transition-colors hover:border-line-strong">
                <SectorTile sector={s} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-[17px] font-semibold leading-tight md:text-[15px]">{s.name}</b>
                    {h && <HealthLabel status={h.status} className="text-[13px]" />}
                  </div>
                  <p className="mt-1 text-[14px] text-fg-2 md:text-[13px]">{h?.reason}</p>
                  <p className="mt-1.5 text-[13px] text-fg-3">
                    {leader ? leader.name : "Sem líder cadastrado"} · {h?.open ?? 0} {h?.open === 1 ? "ação aberta" : "ações abertas"}
                    {subs.length > 0 && ` · ${subs.map((x) => x.name).join(", ")}`}
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
