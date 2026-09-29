// Setores iniciais e dados de exemplo realistas de caldeiraria.
// Usado pelo seed (terminal) e pelo botão "Carregar exemplos" em Configurações.
// Não importa "server-only" porque o seed roda fora do Next.

import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysISO } from "./dates";

type DB = InstanceType<typeof PrismaClient>;

export const INITIAL_SECTORS = [
  { slug: "comercial", name: "Comercial", icon: "handshake", color: "#8B5CF6" },
  { slug: "engenharia", name: "Engenharia/Projetos", shortName: "Engenharia", icon: "drafting-compass", color: "#6366F1" },
  { slug: "pcp", name: "PCP", icon: "calendar-range", color: "#0EA5E9" },
  { slug: "producao", name: "Produção", icon: "factory", color: "#F97316" },
  { slug: "pintura", name: "Pintura/Tratamento", shortName: "Pintura", icon: "paint-roller", color: "#EC4899" },
  { slug: "qualidade", name: "Qualidade", icon: "badge-check", color: "#14B8A6" },
  { slug: "suprimentos", name: "Suprimentos/Compras", shortName: "Suprimentos", icon: "shopping-cart", color: "#EAB308" },
  { slug: "almoxarifado", name: "Almoxarifado", icon: "package", color: "#A16207" },
  { slug: "logistica", name: "Logística/Expedição", shortName: "Logística", icon: "truck", color: "#3B82F6" },
  { slug: "manutencao", name: "Manutenção", icon: "wrench", color: "#64748B" },
  { slug: "sesmt", name: "Segurança do Trabalho", shortName: "SESMT", icon: "hard-hat", color: "#84CC16" },
  { slug: "rh", name: "RH/DP", icon: "users", color: "#F43F5E" },
  { slug: "financeiro", name: "Financeiro/Controladoria", shortName: "Financeiro", icon: "landmark", color: "#10B981" },
  { slug: "diretoria", name: "Diretoria", icon: "briefcase", color: "#D946EF" },
] as const;

export const PRODUCTION_SUBSECTORS = [
  { slug: "caldeiraria", name: "Caldeiraria", icon: "hammer" },
  { slug: "solda", name: "Solda", icon: "flame" },
  { slug: "usinagem", name: "Usinagem", icon: "cog" },
  { slug: "montagem", name: "Montagem", icon: "construction" },
] as const;

/** Cria os setores iniciais se o usuário ainda não tiver nenhum. */
export async function ensureInitialSectors(db: DB, ownerId: string) {
  const count = await db.sector.count({ where: { ownerId } });
  if (count > 0) return;
  let order = 0;
  let producaoId = "";
  for (const s of INITIAL_SECTORS) {
    const row = await db.sector.create({
      data: { ownerId, slug: s.slug, name: s.name, shortName: "shortName" in s ? s.shortName : null, icon: s.icon, color: s.color, order: order++ },
    });
    if (s.slug === "producao") producaoId = row.id;
  }
  await db.sector.create({
    data: { ownerId, slug: "pessoal", name: "Pessoal", icon: "user", color: "#475569", order: -1, personal: true },
  });
  for (const s of PRODUCTION_SUBSECTORS) {
    await db.sector.create({
      data: { ownerId, slug: s.slug, name: s.name, icon: s.icon, color: "#F97316", parentId: producaoId, order: order++ },
    });
  }
}

const d = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00-03:00`);
const monthStart = (iso: string, back: number) => {
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - back, 1));
  return dt;
};

/** Carrega os dados de exemplo (marcados como demo). */
export async function loadDemoData(db: DB, ownerId: string, today: string) {
  await ensureInitialSectors(db, ownerId);
  const sectors = await db.sector.findMany({ where: { ownerId } });
  const S = (slug: string) => {
    const s = sectors.find((x) => x.slug === slug);
    if (!s) throw new Error(`Setor ${slug} não existe`);
    return s.id;
  };
  const off = (n: number) => addDaysISO(today, n);

  // Pessoas
  const peopleData = [
    ["marcos", "Marcos Silva", "Supervisor de Manutenção", "manutencao", "(11) 98811-2034"],
    ["fernanda", "Fernanda Lima", "Coordenadora da Qualidade", "qualidade", "(11) 98765-4321"],
    ["ricardo", "Ricardo Alves", "Analista de PCP", "pcp", "(11) 97654-1122"],
    ["juliana", "Juliana Costa", "Compradora sênior", "suprimentos", "(11) 99102-3344"],
    ["anderson", "Anderson Rocha", "Encarregado de Produção", "producao", "(11) 98433-5566"],
    ["carla", "Carla Mendes", "Gerente Comercial", "comercial", "(11) 99877-6655"],
    ["paulo", "Paulo Nunes", "Coordenador de Engenharia", "engenharia", "(11) 98221-7788"],
    ["beatriz", "Beatriz Souza", "Almoxarife", "almoxarifado", "(11) 97332-9900"],
    ["sonia", "Sônia Prado", "Analista de RH", "rh", "(11) 98544-1010"],
    ["tiago", "Tiago Ramos", "Técnico de Segurança", "sesmt", "(11) 99655-2020"],
    ["luis", "Luís Faria", "Controller", "financeiro", "(11) 98766-3030"],
    ["rogerio", "Rogério Dias", "Líder de Expedição", "logistica", "(11) 97877-4040"],
    ["vanessa", "Vanessa Toledo", "Líder de Pintura", "pintura", "(11) 98988-5050"],
    ["helio", "Hélio Martins", "Diretor Industrial", "diretoria", "(11) 99099-6060"],
  ] as const;
  const P: Record<string, string> = {};
  for (const [key, name, role, sec, phone] of peopleData) {
    const p = await db.person.create({
      data: { ownerId, name, role, sectorId: S(sec), phone, whatsapp: phone, isLeader: true, demo: true },
    });
    P[key] = p.id;
  }

  // Ações
  type A = {
    t: string; s: string; p?: string; k: "DO" | "DELEGATE" | "FOLLOW_UP" | "DECIDE"; due: number | null;
    u?: boolean; i?: boolean; st?: "TODO" | "IN_PROGRESS" | "WAITING" | "DONE"; fu?: number; desc?: string;
    origin?: "MEETING" | "DEMAND" | "KPI" | "CAPTURE" | "VISIT"; on?: string; subs?: [string, boolean][]; tags?: string[];
  };
  const actions: A[] = [
    { t: "Liberar RNC-118: trinca na solda do costado do VP-2210", s: "qualidade", p: "fernanda", k: "FOLLOW_UP", due: -4, u: true, i: true, st: "WAITING", fu: -3, origin: "MEETING", on: "Reunião de produção",
      desc: "Trinca de 40 mm detectada por líquido penetrante na solda circunferencial C3 do costado. Aguardando disposição da Qualidade e plano de reparo com a Engenharia antes do teste hidrostático.",
      subs: [["Relatório de LP anexado", true], ["Plano de reparo aprovado pela Engenharia", false], ["Reinspeção após reparo", false]], tags: ["vp-2210"] },
    { t: "Decidir compra de chapa ASTM A516 Gr.70 (12 t)", s: "suprimentos", k: "DECIDE", due: 0, u: true, i: true, desc: "Três cotações recebidas. Diferença de 8% entre a mais barata e a de menor prazo." },
    { t: "Cobrar orçamento da reforma do compressor de 75 kW", s: "manutencao", p: "marcos", k: "FOLLOW_UP", due: -3, i: true, st: "WAITING", fu: -7 },
    { t: "Enviar proposta revisada do trocador casco-tubo", s: "comercial", p: "carla", k: "FOLLOW_UP", due: -2, u: true, i: true, st: "WAITING", fu: -4, origin: "VISIT", on: "Visita à Usina Santa Clara" },
    { t: "Revisar cronograma da OS 4471 (torre de resfriamento)", s: "pcp", k: "DO", due: 0, i: true, st: "IN_PROGRESS", tags: ["os-4471"] },
    { t: "Definir fornecedor de jateamento terceirizado", s: "pintura", k: "DECIDE", due: -6, i: true },
    { t: "Cobrar laudo de ultrassom dos bocais do VP-2210", s: "qualidade", p: "fernanda", k: "FOLLOW_UP", due: -5, u: true, st: "WAITING", fu: -5, tags: ["vp-2210"] },
    { t: "Cobrar entrega dos flanges ANSI 300#", s: "suprimentos", p: "juliana", k: "FOLLOW_UP", due: -3, u: true, st: "WAITING", fu: -4 },
    { t: "Responder plano de ação da auditoria do cliente", s: "qualidade", p: "fernanda", k: "DELEGATE", due: -1, i: true, st: "IN_PROGRESS", fu: -2 },
    { t: "Aprovar hora extra de sábado da equipe de montagem", s: "producao", k: "DECIDE", due: 0, u: true },
    { t: "Assinar PT de trabalho em altura (montagem externa)", s: "sesmt", k: "DO", due: 0, u: true, i: true },
    { t: "Validar EPS/RQPS para aço inox 316L", s: "engenharia", p: "paulo", k: "DELEGATE", due: 2, i: true, st: "IN_PROGRESS", fu: -3 },
    { t: "Fechar escala de férias de outubro", s: "rh", p: "sonia", k: "DELEGATE", due: 1, st: "WAITING", fu: -6 },
    { t: "Conferir inventário de consumíveis de solda", s: "almoxarifado", p: "beatriz", k: "FOLLOW_UP", due: 3, st: "WAITING", fu: -4 },
    { t: "Revisar orçamento de manutenção preventiva 2027", s: "manutencao", k: "DO", due: 9, i: true },
    { t: "Reunião com Paulo sobre padronização de desenhos", s: "engenharia", k: "DO", due: 4 },
    { t: "Levantar custo de retrabalho de setembro", s: "qualidade", k: "DO", due: 3, i: true, origin: "KPI", on: "Meta: horas de retrabalho" },
    { t: "Aprovar compra de EPIs para solda (máscaras automáticas)", s: "sesmt", p: "tiago", k: "DECIDE", due: 5 },
    { t: "Checar programação de carreta para o VP-2210", s: "logistica", p: "rogerio", k: "FOLLOW_UP", due: 8, st: "WAITING", fu: -1 },
    { t: "Definir meta de produtividade kg/Hh para 2027", s: "producao", k: "DECIDE", due: null, i: true },
    { t: "Revisar fluxo de caixa de outubro com a Controladoria", s: "financeiro", p: "luis", k: "DO", due: -3, i: true, st: "DONE" },
    { t: "Confirmar carreta prancha para o vaso VP-2207", s: "logistica", p: "rogerio", k: "FOLLOW_UP", due: -3, u: true, i: true, st: "DONE" },
    { t: "Aprovar pedido de consumíveis de pintura", s: "pintura", k: "DECIDE", due: -1, st: "DONE" },
  ];
  const ids: string[] = [];
  for (const a of actions) {
    const status = a.st ?? (a.p ? "WAITING" : "TODO");
    const tagConnect = a.tags?.length
      ? {
          connect: await Promise.all(
            a.tags.map(async (name) => ({
              id: (await db.tag.upsert({ where: { ownerId_name: { ownerId, name } }, create: { ownerId, name }, update: {} })).id,
            })),
          ),
        }
      : undefined;
    const row = await db.action.create({
      data: {
        ownerId, demo: true, title: a.t, description: a.desc ?? null, sectorId: S(a.s), assigneeId: a.p ? P[a.p] : null,
        kind: a.k, dueDate: d(a.due === null ? null : off(a.due)), urgent: !!a.u, important: !!a.i, status,
        completedAt: status === "DONE" ? at(off(-1), "16:30") : null,
        lastFollowUpAt: a.fu !== undefined ? at(off(a.fu), "09:12") : null,
        origin: a.origin ?? "CAPTURE", originNote: a.on ?? null,
        createdAt: at(off(-10), "08:40"),
        subtasks: a.subs ? { create: a.subs.map(([title, done], order) => ({ title, done, order })) } : undefined,
        tags: tagConnect,
      },
    });
    ids.push(row.id);
    if (a.fu !== undefined) {
      await db.actionUpdate.create({
        data: { actionId: row.id, kind: "FOLLOW_UP", text: "Cobrado por WhatsApp. Ficou de responder.", createdAt: at(off(a.fu), "09:12") },
      });
    }
  }

  // Prioridades de hoje
  const top = [1, 0, 10, 3, 4];
  await db.dailyPriority.deleteMany({ where: { ownerId, date: d(today)! } });
  await db.dailyPriority.createMany({ data: top.map((i, position) => ({ ownerId, date: d(today)!, actionId: ids[i], position })) });

  // Demandas
  const demands = [
    ["qualidade", "Dossiê de qualidade da OS 4471", "Cliente", -13, 7, "HIGH", "IN_PROGRESS"],
    ["qualidade", "Calibração de instrumentos de medição", "Interna", -18, 17, "MEDIUM", "OPEN"],
    ["comercial", "Proposta para 3 vasos de pressão (Petroquímica Mauá)", "Cliente", -5, 10, "HIGH", "OPEN"],
    ["engenharia", "Memorial de cálculo do tanque TQ-08 conforme API 650", "Cliente", -9, 5, "HIGH", "IN_PROGRESS"],
    ["producao", "Antecipar montagem do skid SK-12", "Diretoria", -3, 12, "CRITICAL", "OPEN"],
    ["manutencao", "Reforma da calandra de 3 rolos", "Interna", -20, 30, "MEDIUM", "OPEN"],
    ["suprimentos", "Homologar segundo fornecedor de tubos sem costura", "Interna", -15, 20, "MEDIUM", "IN_PROGRESS"],
    ["rh", "Contratação de 2 soldadores TIG", "Produção", -7, 21, "HIGH", "OPEN"],
  ] as const;
  for (const [s, title, source, rec, due, priority, status] of demands) {
    await db.demand.create({
      data: { ownerId, demo: true, sectorId: S(s), title, source, receivedAt: d(off(rec))!, dueDate: d(off(due)), priority, status },
    });
  }

  // Necessidades
  const needs = [
    ["qualidade", "Ultrassom phased array", "EQUIPMENT", 185000, false, "HIGH", "ANALYSIS"],
    ["qualidade", "Inspetor de solda N1 (FBTS)", "PEOPLE", 9800, true, "HIGH", "RAISED"],
    ["qualidade", "Treinamento em líquido penetrante (6 pessoas)", "TRAINING", 4200, false, "MEDIUM", "APPROVED"],
    ["producao", "Posicionador de solda 5 t", "EQUIPMENT", 96000, false, "HIGH", "ANALYSIS"],
    ["producao", "Dois soldadores TIG qualificados", "PEOPLE", 14600, true, "CRITICAL", "RAISED"],
    ["manutencao", "Plano de manutenção preditiva (análise de vibração)", "PROCESS", 18000, false, "MEDIUM", "RAISED"],
    ["pintura", "Cabine de pintura com exaustão", "INVESTMENT", 420000, false, "MEDIUM", "RAISED"],
    ["sesmt", "Linha de vida permanente no galpão 2", "INVESTMENT", 38000, false, "HIGH", "APPROVED"],
    ["engenharia", "Licença adicional de software CAD 3D", "EQUIPMENT", 21500, false, "MEDIUM", "REJECTED"],
    ["almoxarifado", "Estantes porta-pallet para chapas", "EQUIPMENT", 27400, false, "LOW", "RAISED"],
  ] as const;
  for (const [s, title, category, cost, recurring, priority, status] of needs) {
    await db.need.create({
      data: {
        ownerId, demo: true, sectorId: S(s), title, category, estimatedCost: cost, recurring, priority, status,
        decidedAt: ["APPROVED", "REJECTED"].includes(status) ? at(off(-4), "10:00") : null,
      },
    });
  }

  // Notas
  const notes = [
    ["qualidade", "Fernanda pediu reforço de 1 inspetor no turno da tarde até o fim do dossiê da OS 4471."],
    ["producao", "Gargalo atual: calandra. Avaliar terceirizar calandragem das virolas do TQ-08."],
    ["comercial", "Usina Santa Clara sinalizou nova compra de 2 trocadores em 2027 se o prazo do atual for cumprido."],
    ["manutencao", "Compressor 75 kW com vazamento de óleo recorrente; preventiva vencida desde agosto."],
    ["suprimentos", "Prazo de chapa grossa subiu para 45 dias nas usinas. Planejar compras com antecedência."],
  ] as const;
  for (const [s, content] of notes) await db.note.create({ data: { ownerId, demo: true, sectorId: S(s), content } });

  // Metas (12 meses)
  type K = [string, string, string, "HIGHER_BETTER" | "LOWER_BETTER", number, string, number[]];
  const kpis: K[] = [
    ["qualidade", "NCs abertas", "un", "LOWER_BETTER", 5, "NCs abertas", [4, 5, 5, 6, 4, 5, 7, 6, 8, 7, 8, 9]],
    ["qualidade", "Índice de refugo", "%", "LOWER_BETTER", 1.5, "Índice de refugo", [1.2, 1.4, 1.3, 1.5, 1.2, 1.4, 1.6, 1.5, 1.7, 1.6, 1.7, 1.8]],
    ["qualidade", "Horas de retrabalho", "h", "LOWER_BETTER", 100, "Horas de retrabalho", [88, 95, 90, 102, 85, 97, 118, 110, 126, 121, 135, 142]],
    ["producao", "OTD", "%", "HIGHER_BETTER", 95, "OTD", [96, 94, 97, 95, 93, 96, 92, 94, 90, 91, 88, 86]],
    ["producao", "Produtividade", "kg/Hh", "HIGHER_BETTER", 18, "Produtividade (kg/Hh)", [17.2, 17.8, 18.4, 18.1, 18.9, 19.3, 18.6, 18.8, 19.1, 19.5, 19.0, 19.2]],
    ["pcp", "Backlog em horas", "h", "HIGHER_BETTER", 12000, "Backlog em horas", [11200, 11800, 12500, 13100, 12900, 13600, 14100, 13800, 14300, 14900, 14200, 14500]],
    ["comercial", "Backlog em R$", "R$", "HIGHER_BETTER", 4000000, "Backlog em R$", [3.6e6, 3.9e6, 4.2e6, 4.4e6, 4.1e6, 4.6e6, 4.8e6, 4.5e6, 4.9e6, 5.1e6, 4.8e6, 5.0e6]],
    ["sesmt", "Dias sem acidente", "dias", "HIGHER_BETTER", 180, "Dias sem acidente", [306, 337, 367, 398, 3, 31, 62, 92, 123, 153, 184, 214]],
    ["rh", "Absenteísmo", "%", "LOWER_BETTER", 3, "Absenteísmo", [2.8, 3.1, 2.6, 2.4, 2.9, 2.2, 2.5, 2.7, 2.3, 2.0, 2.4, 2.1]],
    ["suprimentos", "Prazo médio de compras", "dias", "LOWER_BETTER", 12, "Prazo médio de compras", [11, 12, 11, 13, 12, 14, 13, 15, 16, 15, 17, 18]],
    ["almoxarifado", "Giro de estoque", "vezes/ano", "HIGHER_BETTER", 6, "Giro de estoque", [5.4, 5.6, 5.9, 6.1, 5.8, 6.0, 6.2, 6.3, 6.1, 6.5, 6.2, 6.4]],
  ];
  for (const [s, name, unit, direction, target, template, series] of kpis) {
    await db.kpi.create({
      data: {
        ownerId, demo: true, sectorId: S(s), name, unit, direction, target, template, source: "Planilha do setor",
        entries: { create: series.map((value, idx) => ({ month: monthStart(today, series.length - 1 - idx), value })) },
      },
    });
  }

  // Agenda: séries recorrentes, compromissos da semana e uma ata já preenchida
  const monday = addDaysISO(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const friday = addDaysISO(monday, 4);
  const wednesday = addDaysISO(monday, 2);
  const prodSeries = await db.event.create({
    data: {
      ownerId, demo: true, title: "Reunião de produção", type: "SECTOR_MEETING",
      startsAt: at(addDaysISO(monday, -21), "08:00"), endsAt: at(addDaysISO(monday, -21), "09:00"),
      sectorId: S("producao"), location: "Sala de reuniões do galpão 1", attendees: "Anderson, Ricardo, Fernanda, Paulo",
      rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: [d(addDaysISO(monday, -7))!],
    },
  });
  const lastWeek = await db.event.create({
    data: {
      ownerId, demo: true, title: "Reunião de produção", type: "SECTOR_MEETING",
      startsAt: at(addDaysISO(monday, -7), "08:00"), endsAt: at(addDaysISO(monday, -7), "09:10"),
      sectorId: S("producao"), location: "Sala de reuniões do galpão 1", attendees: "Anderson, Ricardo, Fernanda, Paulo",
      parentId: prodSeries.id, occurrenceDate: d(addDaysISO(monday, -7)),
      minutes: [
        "Pauta: carga da semana, VP-2210, horas extras.",
        "",
        "VP-2210: trinca na solda C3 do costado. Teste hidrostático mantido para esta semana se o reparo for liberado.",
        "Calandra continua gargalo; avaliar terceirização das virolas do TQ-08.",
        "",
        "✓ cobrar Fernanda liberar RNC-118 #qualidade",
        "- Ricardo revisar sequenciamento da semana 41 sexta",
        "- Anderson levantar necessidade de hora extra no sábado amanhã",
      ].join("\n"),
    },
  });
  await db.action.update({ where: { id: ids[0] }, data: { eventId: lastWeek.id, originNote: `Reunião de produção · ${addDaysISO(monday, -7).split("-").reverse().join("/")}` } });
  await db.event.create({
    data: {
      ownerId, demo: true, title: "Reunião semanal da Qualidade", type: "SECTOR_MEETING",
      startsAt: at(addDaysISO(wednesday, -14), "15:00"), endsAt: at(addDaysISO(wednesday, -14), "16:00"),
      sectorId: S("qualidade"), attendees: "Fernanda, inspetores", rrule: "FREQ=WEEKLY;BYDAY=WE",
    },
  });
  await db.event.create({
    data: {
      ownerId, demo: true, title: "Revisão semanal", type: "PERSONAL_BLOCK",
      startsAt: at(addDaysISO(friday, -7), "16:00"), endsAt: at(addDaysISO(friday, -7), "17:00"),
      rrule: "FREQ=WEEKLY;BYDAY=FR",
    },
  });
  const singles = [
    ["Teste hidrostático do VP-2210 com o cliente", "TECH_VISIT", 0, "10:30", "12:00", "qualidade", "Galpão 2 · área de testes"],
    ["Auditoria interna ISO 9001: processo de solda", "AUDIT", 0, "14:00", "15:30", "qualidade", null],
    ["Follow-up da proposta do trocador", "FOLLOW_UP", 0, "16:30", "17:00", "comercial", "Teams"],
    ["Visita ao cliente Usina Santa Clara", "CLIENT_VISIT", 1, "09:00", "11:30", "comercial", "Piracicaba/SP"],
    ["Alinhamento do cronograma da OS 4471", "MEETING", 2, "10:00", "11:00", "pcp", "Sala do PCP"],
    ["Inspeção de segurança da montagem externa", "TECH_VISIT", 3, "08:30", "09:30", "sesmt", "Pátio externo"],
  ] as const;
  for (const [title, type, day, s, e, sec, loc] of singles) {
    await db.event.create({
      data: { ownerId, demo: true, title, type, startsAt: at(off(day), s), endsAt: at(off(day), e), sectorId: S(sec), location: loc },
    });
  }

  // Caixa de entrada
  const inbox = [
    "ligar para o fornecedor de gás sobre contrato de oxigênio",
    "cobrar Ricardo sequenciamento da semana 41 sexta #pcp",
    "ver com RH treinamento NR-35 para montagem externa",
    "ideia: quadro de gestão à vista no galpão 2",
    "decidir terceirização de usinagem das flanges do TQ-08 amanhã",
  ];
  for (const [i, text] of inbox.entries()) {
    await db.inboxItem.create({ data: { ownerId, demo: true, text, createdAt: at(off(-(i % 3)), "18:1" + i) } });
  }

  // Linha do tempo
  const logs = [
    ["qualidade", "Follow-up na RNC-118, ainda sem retorno.", 0],
    ["qualidade", "Meta “NCs abertas”: setembro lançado (9).", -2],
    ["qualidade", "Necessidade “Ultrassom phased array” foi para Em análise.", -3],
    ["qualidade", "Ação “Laudo de ultrassom dos bocais” venceu.", -5],
    ["producao", "OTD de setembro fechou em 86%.", -1],
    ["suprimentos", "Prazo médio de compras subiu para 18 dias.", -2],
    ["manutencao", "Compressor 75 kW parado por 3 horas.", -4],
  ] as const;
  for (const [s, summary, day] of logs) {
    await db.activityLog.create({
      data: { ownerId, demo: true, sectorId: S(s), entityType: "note", entityId: "-", verb: "log", summary, createdAt: at(off(day), "08:40") },
    });
  }
}

/** Remove tudo que foi marcado como exemplo. Setores e seus dados reais continuam. */
export async function clearDemoData(db: DB, ownerId: string) {
  const demoActions = await db.action.findMany({ where: { ownerId, demo: true }, select: { id: true } });
  const ids = demoActions.map((a) => a.id);
  await db.$transaction([
    db.dailyPriority.deleteMany({ where: { ownerId, actionId: { in: ids } } }),
    db.action.deleteMany({ where: { ownerId, demo: true } }),
    db.demand.deleteMany({ where: { ownerId, demo: true } }),
    db.need.deleteMany({ where: { ownerId, demo: true } }),
    db.note.deleteMany({ where: { ownerId, demo: true } }),
    db.kpi.deleteMany({ where: { ownerId, demo: true } }),
    db.event.deleteMany({ where: { ownerId, demo: true, parentId: { not: null } } }),
    db.event.deleteMany({ where: { ownerId, demo: true } }),
    db.inboxItem.deleteMany({ where: { ownerId, demo: true } }),
    db.activityLog.deleteMany({ where: { ownerId, demo: true } }),
    db.action.updateMany({ where: { ownerId, assignee: { demo: true } }, data: { assigneeId: null } }),
    db.person.deleteMany({ where: { ownerId, demo: true } }),
  ]);
  await db.tag.deleteMany({ where: { ownerId, actions: { none: {} }, demands: { none: {} }, needs: { none: {} }, notes: { none: {} } } });
}
