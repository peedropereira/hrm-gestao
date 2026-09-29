import { timingSafeEqual } from "node:crypto";
import { pruneReminderLog, runEventReminders, runMorningDigest } from "@/lib/push";

// Agendador dos avisos. Chamado a cada 5 minutos (cron-job.org) e uma vez por dia pela Vercel.
// Protegido pela variável CRON_SECRET: no cabeçalho "Authorization: Bearer …" ou em ?chave=…

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("chave") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const now = new Date();
  const digest = await runMorningDigest(now);
  const reminders = await runEventReminders(now);
  if (now.getUTCMinutes() < 5) await pruneReminderLog(now);
  return Response.json({ ok: true, reminders, digest, at: now.toISOString() });
}
