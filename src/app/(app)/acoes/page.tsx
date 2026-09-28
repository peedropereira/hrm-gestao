import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getOpenActions, getRecentDone } from "@/lib/data";
import { addDaysISO, todayISO } from "@/lib/dates";
import { ActionsView } from "./actions-view";

export const metadata: Metadata = { title: "Ações" };

export default async function ActionsPage({ searchParams }: PageProps<"/acoes">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const [open, done] = await Promise.all([getOpenActions(user.id), getRecentDone(user.id, addDaysISO(today, -14), 40)]);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return <ActionsView open={open} recentDone={done} filter={str(sp.f) ?? "todas"} view={str(sp.v) ?? "lista"} selected={str(sp.sel)} />;
}
