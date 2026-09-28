import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, demoCount, theme] = await Promise.all([
    getSettings(user.id),
    db.action.count({ where: { ownerId: user.id, demo: true } }),
    cookies().then((c) => c.get("tema")?.value ?? "sistema"),
  ]);
  return (
    <SettingsView
      login={user.login}
      theme={theme}
      hasDemo={demoCount > 0}
      settings={{ redOverdueMin: settings.redOverdueMin, kpiRedPercent: settings.kpiRedPercent, delegateAlertDays: settings.delegateAlertDays }}
    />
  );
}
