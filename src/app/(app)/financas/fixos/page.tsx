import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getRecurring } from "@/lib/finance";
import { FixosView } from "./fixos-view";

export const metadata: Metadata = { title: "Gastos fixos" };

export default async function FixosPage() {
  const user = await requireUser();
  const items = await getRecurring(user.id);
  return <FixosView items={items} />;
}
