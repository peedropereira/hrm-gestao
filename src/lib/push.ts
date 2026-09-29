import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";
import { getOccurrences, localTime } from "@/lib/agenda";
import { getOpenActions, getSettings, isOverdue } from "@/lib/data";
import { addDaysISO, todayISO } from "@/lib/dates";
import { untilLabel } from "@/lib/reminder-options";

// Avisos no celular (Web Push). As chaves VAPID ficam só nas variáveis de ambiente.

export type PushPayload = { title: string; body: string; url?: string; tag?: string; alarm?: boolean };

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let ready = false;
function setup() {
  if (ready) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://hrm-gestao.vercel.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
  return true;
}

/** Envia para todos os aparelhos do usuário. Remove os aparelhos que não existem mais. */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!setup()) return { sent: 0, devices: 0 };
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: "high" });
        sent++;
        await db.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date() } });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("push falhou", code, (e as Error).message);
      }
    }),
  );
  return { sent, devices: subs.length };
}

/** Registra o aviso; devolve false se já foi enviado (evita repetir). */
async function claim(key: string) {
  try {
    await db.reminderLog.create({ data: { key } });
    return true;
  } catch {
    return false;
  }
}

// O agendador roda a cada 5 minutos: um aviso pode sair até 5 min antes da hora marcada, nunca depois.
const EARLY_MS = 5 * 60000;

/** Avisos de compromissos que estão chegando. */
export async function runEventReminders(now = new Date()) {
  const users = await db.user.findMany({ where: { pushSubs: { some: {} } }, select: { id: true } });
  let sent = 0;
  const today = todayISO(now);
  for (const u of users) {
    const settings = await getSettings(u.id);
    const occ = await getOccurrences(u.id, today, addDaysISO(today, 2));
    for (const o of occ) {
      if (o.allDay) continue;
      const lead = o.reminderMinutes ?? settings.reminderMinutes;
      if (lead < 0) continue;
      const start = new Date(o.startsAt).getTime();
      const fireAt = start - lead * 60000;
      const late = lead === 0 ? start + EARLY_MS : start;
      if (now.getTime() < fireAt - EARLY_MS || now.getTime() >= late) continue;
      if (!(await claim(`evento:${o.eventId}:${o.date}:${o.start}:${lead}`))) continue;
      const when = untilLabel(start - now.getTime());
      const place = o.location ? ` · ${o.location}` : "";
      const r = await sendPush(u.id, {
        title: o.title,
        body: `${when === "agora" ? "Começa agora" : `Começa ${when}`} · ${o.start}–${o.end}${place}`,
        url: o.href,
        tag: `evento-${o.key}`,
        alarm: true,
      });
      sent += r.sent;
    }
  }
  return sent;
}

/** Resumo do dia pela manhã (a partir das 6h, uma vez por dia). */
export async function runMorningDigest(now = new Date()) {
  const hour = Number(localTime(now).slice(0, 2));
  if (hour < 6 || hour >= 12) return 0;
  const today = todayISO(now);
  const users = await db.user.findMany({ where: { pushSubs: { some: {} } }, select: { id: true } });
  let sent = 0;
  for (const u of users) {
    const settings = await getSettings(u.id);
    if (!settings.morningDigest) continue;
    if (!(await claim(`resumo:${u.id}:${today}`))) continue;
    const [occ, open] = await Promise.all([getOccurrences(u.id, today, today), getOpenActions(u.id)]);
    const dueToday = open.filter((a) => a.dueDate === today).length;
    const overdue = open.filter((a) => isOverdue(a, today)).length;
    const parts = [
      occ.length ? `${occ.length} ${occ.length === 1 ? "compromisso" : "compromissos"}` : "nenhum compromisso",
      `${dueToday} ${dueToday === 1 ? "ação para hoje" : "ações para hoje"}`,
      ...(overdue ? [`${overdue} ${overdue === 1 ? "atrasada" : "atrasadas"}`] : []),
    ];
    const list = occ
      .slice(0, 4)
      .map((o) => `${o.allDay ? "dia todo" : o.start} ${o.title}`)
      .join("\n");
    const r = await sendPush(u.id, { title: `Bom dia! Hoje: ${parts.join(", ")}`, body: list || "Toque para ver o Painel do Dia.", url: "/hoje", tag: `resumo-${today}` });
    sent += r.sent;
  }
  return sent;
}

/** Limpa o registro de avisos antigos. */
export async function pruneReminderLog(now = new Date()) {
  await db.reminderLog.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 14 * 86400000) } } });
}
