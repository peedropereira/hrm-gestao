import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getActionsByIds } from "@/lib/data";
import { loadActionExtra } from "@/lib/action-extra";
import { DetailClient } from "./detail-client";

export const metadata: Metadata = { title: "Ação" };

export default async function ActionPage({ params }: PageProps<"/acoes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [[action], extra] = await Promise.all([getActionsByIds(user.id, [id]), loadActionExtra(user.id, id)]);
  if (!action || !extra) notFound();
  return (
    <div className="mx-auto max-w-[720px] md:px-7 md:pt-6">
      <div className="px-2 pt-1 md:px-0">
        <Link href="/acoes" className="inline-flex h-11 items-center gap-0.5 px-2 text-[17px] font-medium text-ac-text md:px-0 md:text-[14px]">
          <ChevronLeft className="size-[22px] md:size-4" /> Ações
        </Link>
      </div>
      <DetailClient action={action} extra={extra} />
    </div>
  );
}
