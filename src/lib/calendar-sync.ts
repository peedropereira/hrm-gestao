// Sincronização futura com Outlook / Microsoft 365 (Microsoft Graph).
// NÃO está ativa. Este arquivo define o contrato para quando for implementada,
// para que a agenda já nasça com os campos certos.
//
// Mapeamento Event (banco) ↔ event (Graph /me/events):
//   title            ↔ subject
//   startsAt/endsAt  ↔ start/end { dateTime, timeZone: "E. South America Standard Time" }
//   allDay           ↔ isAllDay
//   location         ↔ location.displayName
//   attendees        ↔ attendees[] (hoje texto livre; na sincronização vira lista de e-mails)
//   minutes          ↔ body.content (opcional, só se o usuário quiser enviar a ata)
//   rrule            ↔ recurrence { pattern, range } (FREQ/INTERVAL/BYDAY/UNTIL têm equivalente direto)
//   exdates / parentId + occurrenceDate ↔ ocorrências canceladas ou alteradas (seriesMasterId + originalStart)
//   externalId       = id do evento no Graph
//   externalSource   = "microsoft-graph"
//   etag             = @odata.etag (controle de conflito: quem alterou por último)
//
// Estratégia prevista: login Microsoft (OAuth, escopo Calendars.ReadWrite), leitura incremental
// com /me/calendarView/delta a cada abertura da Agenda e gravação imediata ao salvar no app.

export type ExternalCalendarEvent = {
  externalId: string;
  etag: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  rrule: string | null;
  cancelled: boolean;
};

export interface CalendarProvider {
  readonly source: "microsoft-graph";
  /** Eventos alterados desde o último token de sincronização. */
  pullChanges(syncToken: string | null): Promise<{ events: ExternalCalendarEvent[]; nextToken: string }>;
  /** Cria ou atualiza no calendário externo; devolve o id e o etag atualizados. */
  push(event: ExternalCalendarEvent & { externalId: string | null }): Promise<{ externalId: string; etag: string }>;
  remove(externalId: string): Promise<void>;
}
