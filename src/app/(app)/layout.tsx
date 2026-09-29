import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getInboxCount, getOpenActions, getPeople, getSectorHealth, getSectors, getSettings, isOverdue } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { AppProvider } from "@/components/app-provider";
import { GlobalEffects, OfflineBanner, Sidebar, TabBar } from "@/components/shell";
import { CaptureSheet } from "@/components/capture-sheet";
import { SearchPalette } from "@/components/search-palette";
import type { Health } from "@/components/ds";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (!user.onboardingDone) redirect("/boas-vindas");

  const [sectors, people, inboxCount, open, settings, health] = await Promise.all([
    getSectors(user.id),
    getPeople(user.id),
    getInboxCount(user.id),
    getOpenActions(user.id),
    getSettings(user.id),
    getSectorHealth(user.id, user.id),
  ]);
  const today = todayISO();
  const healthMap: Record<string, Health> = Object.fromEntries(health.map((h) => [h.sectorId, h.status]));

  return (
    <AppProvider
      data={{
        today,
        userName: user.name,
        sectors,
        people,
        inboxCount,
        overdueCount: open.filter((a) => isOverdue(a, today)).length,
        delegateAlertDays: settings.delegateAlertDays,
        reminderMinutes: settings.reminderMinutes,
        ai: !!process.env.ANTHROPIC_API_KEY,
      }}
    >
      <div className="flex min-h-dvh">
        <Sidebar health={healthMap} />
        <div className="min-w-0 flex-1">
          <OfflineBanner />
          <main className="pb-[calc(112px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:pb-10 md:pt-0">{children}</main>
        </div>
      </div>
      <TabBar />
      <CaptureSheet />
      <SearchPalette />
      <GlobalEffects />
    </AppProvider>
  );
}
