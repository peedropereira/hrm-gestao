import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { vapidPublicKey } from "@/lib/push";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, demoCount, theme, devices, h] = await Promise.all([
    getSettings(user.id),
    db.action.count({ where: { ownerId: user.id, demo: true } }),
    cookies().then((c) => c.get("tema")?.value ?? "sistema"),
    db.pushSubscription.count({ where: { userId: user.id } }),
    headers(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cronUrl = process.env.CRON_SECRET && host ? `${proto}://${host}/api/cron/lembretes?chave=${process.env.CRON_SECRET}` : null;
  return (
    <SettingsView
      login={user.login}
      theme={theme}
      hasDemo={demoCount > 0}
      notifications={{
        vapidKey: vapidPublicKey(),
        devices,
        reminderMinutes: settings.reminderMinutes,
        morningDigest: settings.morningDigest,
        calendarToken: settings.calendarToken,
        cronUrl,
      }}
      settings={{ redOverdueMin: settings.redOverdueMin, kpiRedPercent: settings.kpiRedPercent, delegateAlertDays: settings.delegateAlertDays }}
    />
  );
}
