import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Caixa de entrada" };

export default async function InboxPage() {
  const user = await requireUser();
  const items = await db.inboxItem.findMany({
    where: { ownerId: user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, text: true, createdAt: true },
  });
  return <InboxView items={items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))} />;
}
