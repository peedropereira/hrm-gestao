import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getOccurrences } from "@/lib/agenda";
import { getSettings } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { icsCalendar, icsEvent } from "@/lib/ics";

// Um compromisso em .ics, com alarme: o celular abre no calendário e toca antes da hora.
export async function GET(req: Request, ctx: RouteContext<"/api/agenda/ics/[id]">) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const e = await db.event.findFirst({ where: { id, ownerId: user.id, deletedAt: null }, select: { id: true, startsAt: true, rrule: true } });
  if (!e) return new Response("Compromisso não encontrado.", { status: 404 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("d") ?? "") ? url.searchParams.get("d")! : todayISO(e.startsAt);
  const occ = (await getOccurrences(user.id, date, date)).find((o) => o.eventId === e.id || o.seriesId === e.id);
  if (!occ) return new Response("Compromisso não encontrado nesta data.", { status: 404 });
  const settings = await getSettings(user.id);
  const reminder = occ.reminderMinutes ?? settings.reminderMinutes;
  const body = icsCalendar([icsEvent(occ, { origin: url.origin, reminder: reminder < 0 ? settings.reminderMinutes : reminder })], "Agenda Pedro Souza");
  const slug = occ.title.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "compromisso";
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
