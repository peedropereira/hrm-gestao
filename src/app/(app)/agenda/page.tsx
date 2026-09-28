import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getOccurrences } from "@/lib/agenda";
import { getEventOptions } from "@/lib/event-options";
import { addDaysISO, nowTimeSP, todayISO, weekdayOf } from "@/lib/dates";
import { AgendaView, type AgendaMode } from "./agenda-view";

export const metadata: Metadata = { title: "Agenda" };

/** Segunda-feira da semana da data. */
function mondayOf(iso: string) {
  return addDaysISO(iso, -((weekdayOf(iso) + 6) % 7));
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const mode: AgendaMode = sp.v === "dia" || sp.v === "mes" ? sp.v : "semana";
  const date = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;

  let from = date;
  let to = date;
  if (mode === "semana") {
    from = mondayOf(date);
    to = addDaysISO(from, 6);
  } else if (mode === "mes") {
    const first = `${date.slice(0, 7)}-01`;
    const [y, m] = date.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    from = mondayOf(first);
    to = addDaysISO(mondayOf(last), 6);
  }

  const [items, options] = await Promise.all([getOccurrences(user.id, from, to), getEventOptions(user.id)]);
  return <AgendaView mode={mode} date={date} from={from} to={to} items={items} now={nowTimeSP()} options={options} />;
}
