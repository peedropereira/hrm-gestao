"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { pushConfigured, sendPush } from "@/lib/push";
import { fail, refreshAll, type Result } from "./_shared";

const subInput = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

/** Guarda este aparelho para receber avisos. */
export async function savePushSubscription(raw: z.input<typeof subInput>, device: string): Promise<Result> {
  try {
    const user = await actionUser();
    const s = subInput.parse(raw);
    const data = { userId: user.id, p256dh: s.keys.p256dh, auth: s.keys.auth, device: device.slice(0, 120) || null };
    await db.pushSubscription.upsert({ where: { endpoint: s.endpoint }, create: { endpoint: s.endpoint, ...data }, update: data });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  try {
    const user = await actionUser();
    await db.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: z.string().max(2000).parse(endpoint) } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function sendTestPush(): Promise<Result<{ sent: number }>> {
  try {
    const user = await actionUser();
    if (!pushConfigured()) throw new Error("Os avisos ainda não foram configurados no servidor.");
    const r = await sendPush(user.id, {
      title: "Teste de aviso",
      body: "Tudo certo: este aparelho vai receber os avisos das reuniões.",
      url: "/config",
      tag: "teste",
      alarm: true,
    });
    if (!r.sent) throw new Error("Não foi possível entregar. Desative e ative os avisos de novo neste aparelho.");
    return { ok: true, data: { sent: r.sent } };
  } catch (e) {
    return fail(e);
  }
}

const reminderInput = z.object({
  reminderMinutes: z.number().int().min(-1).max(10080),
  morningDigest: z.boolean(),
});

export async function updateReminderSettings(raw: z.input<typeof reminderInput>): Promise<Result> {
  try {
    const user = await actionUser();
    const d = reminderInput.parse(raw);
    await db.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...d }, update: d });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Cria (ou troca) o endereço secreto da agenda para o calendário do celular. */
export async function resetCalendarToken(): Promise<Result<{ token: string }>> {
  try {
    const user = await actionUser();
    const token = randomBytes(24).toString("base64url");
    await db.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, calendarToken: token }, update: { calendarToken: token } });
    return { ok: true, data: { token } };
  } catch (e) {
    return fail(e);
  }
}
