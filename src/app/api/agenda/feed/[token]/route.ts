import { db } from "@/lib/db";
import { getOccurrences } from "@/lib/agenda";
import { addDaysISO, todayISO } from "@/lib/dates";
import { icsCalendar, icsEvent } from "@/lib/ics";

// Agenda assinável pelo calendário do celular (endereço secreto, sem login).
// O calendário do aparelho atualiza sozinho e toca o alarme antes de cada compromisso.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/agenda/feed/[token]">) {
  const { token } = await ctx.params;
  const t = token.replace(/\.ics$/, "");
  if (t.length < 24) return new Response("Não encontrado.", { status: 404 });
  const settings = await db.userSettings.findUnique({ where: { calendarToken: t } });
  if (!settings) return new Response("Não encontrado.", { status: 404 });
  const today = todayISO();
  const occ = await getOccurrences(settings.userId, addDaysISO(today, -30), addDaysISO(today, 180));
  const origin = new URL(req.url).origin;
  const body = icsCalendar(
    occ.map((o) => icsEvent(o, { origin, reminder: o.reminderMinutes ?? settings.reminderMinutes })),
    "Agenda Pedro Souza",
  );
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
