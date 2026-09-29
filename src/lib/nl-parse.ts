// Interpretador de texto natural em português para criar ações e compromissos em uma linha.
// Ex.: "cobrar Marcos orçamento compressor sexta #manutencao !"
//      "reunião com Anderson amanhã às 14h sobre hora extra"
// Entende texto digitado e o que sai do reconhecimento de voz ("às 14 horas", "setor manutenção").
// Roda no aparelho (sem serviço externo) e também no servidor.

import { addDaysISO, brToISO, weekdayOf } from "./dates";

export type NLPerson = { id: string; name: string; sectorId: string | null };
export type NLSector = { id: string; name: string; shortName: string | null; slug: string };
export type NLKind = "DO" | "DELEGATE" | "FOLLOW_UP" | "DECIDE";
export type NLEventType = "MEETING" | "CLIENT_VISIT" | "TECH_VISIT" | "AUDIT" | "SECTOR_MEETING" | "PERSONAL_BLOCK" | "FOLLOW_UP";

export type NLResult = {
  title: string;
  kind: NLKind;
  assigneeId: string | null;
  sectorId: string | null;
  sectorInferred: boolean;
  dueDate: string | null;
  urgent: boolean;
  important: boolean;
  tags: string[];
  /** Parece compromisso de agenda (reunião, visita…) ou tem horário. */
  isEvent: boolean;
  eventType: NLEventType;
  startTime: string | null; // HH:mm
  endTime: string | null;
  /** Duração falada ("por 2 horas"), em minutos. */
  durationMin: number | null;
  /** Aviso antes, em minutos (-1 = sem aviso; null = padrão). */
  reminderMinutes: number | null;
  location: string | null;
};

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const WEEKDAY: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Remove o trecho [start, end) mantendo espaços. */
function cut(s: string, start: number, end: number) {
  return `${s.slice(0, start)} ${s.slice(end)}`;
}

/** Remove preposições/artigos soltos que sobram antes de um trecho removido ("com o", "para a"). */
function trimDangling(s: string, idx: number) {
  const before = s.slice(0, idx);
  const m = norm(before).match(/(\s(?:com|pro|pra|para|pelo|pela|do|da|de|ao|a|o|no|na))+\s*$/);
  if (!m || m.index === undefined) return { s, idx };
  return { s: before.slice(0, m.index) + " " + s.slice(idx), idx: m.index + 1 };
}

function hhmm(h: number, m = 0) {
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

const NUM_WORDS: [string, number][] = [
  ["vinte e tres", 23],
  ["vinte e duas", 22],
  ["vinte e dois", 22],
  ["vinte e uma", 21],
  ["vinte e um", 21],
  ["dezenove", 19],
  ["dezoito", 18],
  ["dezessete", 17],
  ["dezesseis", 16],
  ["quinze", 15],
  ["quatorze", 14],
  ["catorze", 14],
  ["treze", 13],
  ["doze", 12],
  ["onze", 11],
  ["vinte", 20],
  ["trinta", 30],
  ["quarenta", 40],
  ["dez", 10],
  ["nove", 9],
  ["oito", 8],
  ["sete", 7],
  ["seis", 6],
  ["cinco", 5],
  ["quatro", 4],
  ["tres", 3],
  ["duas", 2],
  ["dois", 2],
  ["uma", 1],
  ["um", 1],
];
const MIN_WORDS: [string, string][] = [
  ["quarenta e cinco", "45"],
  ["cinquenta e cinco", "55"],
  ["trinta e cinco", "35"],
  ["vinte e cinco", "25"],
  ["cinquenta", "50"],
  ["quarenta", "40"],
  ["trinta", "30"],
  ["vinte", "20"],
  ["quinze", "15"],
  ["dez", "10"],
  ["cinco", "05"],
];

/**
 * Troca números por extenso em contexto de hora/prazo ("às duas e meia", "uma hora antes").
 * Mantém "uma" e "dois" comuns no texto ("comprar uma bomba").
 */
function spokenNumbers(input: string) {
  let s = input;
  const words = NUM_WORDS.map(([w]) => w).join("|");
  // norm() preserva o tamanho, então os índices valem para o texto original
  const replaceAll = (re: RegExp, fn: (m: RegExpExecArray) => { at: number; len: number; text: string }) => {
    for (let guard = 0; guard < 10; guard++) {
      const m = re.exec(norm(s));
      if (!m) break;
      const { at, len, text } = fn(m);
      s = s.slice(0, at) + text + s.slice(at + len);
    }
  };
  const val = (w: string) => NUM_WORDS.find(([k]) => k === w)?.[1] ?? 0;
  // depois de "às", "das", "até as", "daqui a"
  replaceAll(new RegExp(String.raw`\b(as|das|ate as|a partir das|por volta das|daqui a|daqui)\s+(${words})\b`), (m) => ({
    at: m.index + m[0].length - m[2].length,
    len: m[2].length,
    text: String(val(m[2])),
  }));
  // antes de "horas", "minutos", "da tarde", "dias antes"
  replaceAll(new RegExp(String.raw`\b(${words})(?=\s+(?:horas?|minutos?|dias?\s+antes|da manha|da tarde|da noite|e meia))`), (m) => ({
    at: m.index,
    len: m[1].length,
    text: String(val(m[1])),
  }));
  // minutos por extenso depois da hora: "2 e quinze" → "2 e 15"
  const mins = MIN_WORDS.map(([w]) => w).join("|");
  replaceAll(new RegExp(String.raw`\b(\d{1,2})\s+e\s+(${mins})\b`), (m) => ({
    at: m.index + m[0].length - m[2].length,
    len: m[2].length,
    text: MIN_WORDS.find(([k]) => k === m[2])![1],
  }));
  return s;
}

/**
 * Lê "14h30", "2 e meia", "9 horas". Aplica tarde/noite (+12).
 * Sem período, 1 a 5 viram tarde ("reunião às 3" = 15h), como se fala no dia a dia.
 */
function readTime(chunk: string, pm: boolean, am: boolean, strictBare = false) {
  const m = chunk.match(/(\d{1,2})(?:(?::|h)(\d{2})|\s*(?:horas?\s*)?e\s*(\d{2}|meia))?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : m[3] === "meia" ? 30 : m[3] ? Number(m[3]) : 0;
  if (h > 23 || mi > 59) return null;
  if (pm && h < 12) h += 12;
  else if (!am && !strictBare && h >= 1 && h <= 5) h += 12;
  return { h, m: mi };
}

export function parseNL(
  raw: string,
  ctx: { today: string; people: NLPerson[]; sectors: NLSector[]; now?: string },
): NLResult {
  // `s` mantém acentos para o título; `norm(s)` tem o mesmo comprimento (acentos pré-compostos).
  let s = ` ${raw.replace(/\s+/g, " ").trim()} `;
  const r: NLResult = {
    title: "",
    kind: "DO",
    assigneeId: null,
    sectorId: null,
    sectorInferred: false,
    dueDate: null,
    urgent: false,
    important: false,
    tags: [],
    isEvent: false,
    eventType: "MEETING",
    startTime: null,
    endTime: null,
    durationMin: null,
    reminderMinutes: null,
    location: null,
  };

  // Tipo pelo verbo inicial
  const first = norm(s.trim().split(" ")[0] ?? "");
  if (/^(cobrar|cobra|lembrar|checar|verificar)/.test(first)) r.kind = "FOLLOW_UP";
  else if (/^(decidir|aprovar|definir|escolher|autorizar)/.test(first)) r.kind = "DECIDE";
  else if (/^(delegar|pedir|passar|solicitar)/.test(first)) r.kind = "DELEGATE";

  // Compromisso? (palavras de agenda)
  {
    const n = norm(s);
    const ev = n.match(/\b(reuniao|reunir|visita|visitar|auditoria|agendar|marcar|encontro|call|alinhamento|apresentacao|treinamento|consulta|medico|dentista|entrevista|almoco|bloquear agenda)\b/);
    if (ev) {
      r.isEvent = true;
      if (/\bauditoria\b/.test(n)) r.eventType = "AUDIT";
      else if (/\bvisita(r)?\b/.test(n)) r.eventType = /\bcliente\b/.test(n) ? "CLIENT_VISIT" : "TECH_VISIT";
      else if (/\b(medico|dentista|consulta|almoco|academia|pessoal|bloquear agenda)\b/.test(n)) r.eventType = "PERSONAL_BLOCK";
      else if (/\bfollow[- ]?up\b/.test(n)) r.eventType = "FOLLOW_UP";
      else if (/\breuniao (de|da|do) (setor|producao|qualidade|pcp|manutencao|engenharia|comercial|suprimentos|compras|pintura|sesmt|seguranca|rh|financeiro|logistica|almoxarifado|diretoria)\b/.test(n)) r.eventType = "SECTOR_MEETING";
    }
    // "agendar"/"marcar" no começo não fazem parte do título
    const lead = n.match(/^\s*(agendar|marcar|bloquear agenda para|bloquear agenda)\s+/);
    if (lead) s = " " + s.slice(lead[0].length);
  }

  // #setor ou #tag
  for (const m of [...s.matchAll(/#([\p{L}\p{N}_/-]+)/gu)]) {
    const t = norm(m[1]);
    const sec = ctx.sectors.find(
      (x) =>
        x.slug === t ||
        norm(x.name).replace(/[^a-z0-9]/g, "").startsWith(t.replace(/[^a-z0-9]/g, "")) ||
        (x.shortName && norm(x.shortName).startsWith(t)),
    );
    if (sec && !r.sectorId) r.sectorId = sec.id;
    else r.tags.push(m[1].toLowerCase());
    s = s.replace(m[0], " ");
  }

  // "setor manutenção" (falado, sem #)
  if (!r.sectorId) {
    const n = norm(s);
    const m = n.match(/\b(?:no |do |para o |pro )?setor (?:de |da |do )?([a-z/]+(?: [a-z]+)?)/);
    if (m && m.index !== undefined) {
      const words = m[1].split(" ");
      for (const w of [m[1], words[0]]) {
        const sec = ctx.sectors.find((x) => x.slug === w || norm(x.name).startsWith(w) || (x.shortName && norm(x.shortName).startsWith(w)));
        if (sec) {
          r.sectorId = sec.id;
          const len = m[0].length - (m[1].length - w.length);
          s = cut(s, m.index, m.index + len);
          break;
        }
      }
    }
  }

  // Prioridade: "!!" urgente e importante, "!" urgente, palavras "urgente"/"importante"
  if (/!!/.test(s)) {
    r.urgent = true;
    r.important = true;
  } else if (/(^|\s)!(\s|$)/.test(s)) r.urgent = true;
  if (/\burgente\b/i.test(norm(s))) r.urgent = true;
  if (/\bimportante\b/i.test(norm(s))) r.important = true;
  s = s.replace(/!+/g, " ");
  {
    const n = norm(s);
    for (const w of ["urgente", "importante"]) {
      const i = n.search(new RegExp(`\\b${w}\\b`));
      if (i >= 0) s = cut(s, i, i + w.length);
    }
  }

  // Números falados em horários e prazos: "às duas e meia da tarde" → "às 2 e meia da tarde"
  s = spokenNumbers(s);

  // Aviso: "me avise 15 minutos antes", "com alarme 1 hora antes", "sem aviso"
  {
    const n = norm(s);
    const m = n.match(
      /(?:,?\s*(?:e\s+)?(?:(?:me|pra me|para me)\s+)?(?:avis(?:ar|e|a)|lembr(?:ar|e|a)|alarme|alerta|notific(?:ar|a|e))(?:\s+me)?(?:\s+com)?(?:\s+de)?\s+)?\b(\d+|meia)\s*(minutos?|min|horas?|h|dias?)\s+antes\b/,
    );
    const none = n.match(/,?\s*\bsem (?:aviso|alarme|lembrete|alerta)\b/);
    const dayBefore = n.match(/,?\s*(?:(?:e\s+)?(?:me\s+)?(?:avis(?:ar|e|a)|lembr(?:ar|e|a))\s+)?\bno dia anterior\b/);
    if (m && m.index !== undefined) {
      const q = m[1] === "meia" ? 0.5 : Number(m[1]);
      const unit = m[2].startsWith("d") ? 1440 : m[2].startsWith("h") ? 60 : 1;
      r.reminderMinutes = Math.round(q * unit);
      s = cut(s, m.index, m.index + m[0].length);
    } else if (none && none.index !== undefined) {
      r.reminderMinutes = -1;
      s = cut(s, none.index, none.index + none[0].length);
    } else if (dayBefore && dayBefore.index !== undefined) {
      r.reminderMinutes = 1440;
      s = cut(s, dayBefore.index, dayBefore.index + dayBefore[0].length);
    }
    const plain = norm(s).match(/,?\s*\bcom (?:aviso|alarme|lembrete|alerta)\b/);
    if (plain && plain.index !== undefined) s = cut(s, plain.index, plain.index + plain[0].length);
  }

  // Daqui a pouco: "daqui a 2 horas", "daqui a meia hora"
  if (ctx.now) {
    const n = norm(s);
    const m = n.match(/\bdaqui (?:a )?(\d+|meia)\s*(horas?|h|minutos?|min)\b/);
    if (m && m.index !== undefined) {
      const q = m[1] === "meia" ? 30 : Number(m[1]) * (m[2].startsWith("h") ? 60 : 1);
      const [h, mi] = ctx.now.split(":").map(Number);
      let total = Math.ceil((h * 60 + mi + q) / 5) * 5;
      r.dueDate = ctx.today;
      if (total >= 24 * 60) {
        total -= 24 * 60;
        r.dueDate = addDaysISO(ctx.today, 1);
      }
      r.startTime = hhmm(Math.floor(total / 60), total % 60);
      r.isEvent = true;
      s = cut(s, m.index, m.index + m[0].length);
    }
  }

  // Duração: "por 2 horas", "durante meia hora", "de 30 minutos"
  {
    const n = norm(s);
    const m = n.match(/\b(?:por|durante|de|com duracao de)\s+(\d+|meia)\s*(horas?|h|minutos?|min)\b(?:\s+e\s+(meia|\d{2})(?:\s*minutos?)?)?(?:\s+de duracao)?/);
    if (m && m.index !== undefined) {
      const extra = m[3] === "meia" ? 30 : m[3] ? Number(m[3]) : 0;
      r.durationMin = m[1] === "meia" ? 30 : Number(m[1]) * (m[2].startsWith("h") ? 60 : 1) + extra;
      if (r.durationMin > 0 && r.durationMin <= 12 * 60) s = cut(s, m.index, m.index + m[0].length);
      else r.durationMin = null;
    }
  }

  // Horário: "das 9 às 10h30", "às 14h", "14:30", "14 horas", "às 3 da tarde", "meio-dia"
  if (!r.startTime) {
    const n = norm(s);
    const T = String.raw`\d{1,2}(?:(?::|h)\d{2}|\s*(?:horas?\s*)?e\s*(?:\d{2}|meia))?\s*(?:h(?:oras?|rs?)?\b)?`;
    const P = String.raw`(?:\s*(?:da|de|a|pela)\s+(?:manha|tarde|noite))?`;
    const range = n.match(new RegExp(String.raw`\b(?:das|de)\s+(${T})\s*(?:as|a|ate)\s+(${T})(${P})`));
    const single = n.match(new RegExp(String.raw`\b(?:as|a partir das|por volta das|ate as)\s+(${T})(${P})`));
    const bare = n.match(new RegExp(String.raw`\b(\d{1,2}(?::|h)\d{2}|\d{1,2}\s?(?:h|horas)\b|\d{1,2}(?=\s*(?:da|de)\s+(?:manha|tarde|noite)))(${P})`));
    const noon = n.match(/\b(?:ao |as )?meio[- ]dia(?: e meia)?\b/);
    let m: RegExpMatchArray | null = null;
    if (range) {
      const pm = /tarde|noite/.test(range[3]);
      const am = /manha/.test(range[3]);
      const a = readTime(range[1], pm, am);
      let b = readTime(range[2], pm, am);
      if (a && b && b.h < a.h && b.h < 12) b = { ...b, h: b.h + 12 };
      if (a && b) {
        r.startTime = hhmm(a.h, a.m);
        r.endTime = hhmm(b.h, b.m);
        m = range;
      }
    }
    if (!m && single) {
      const t = readTime(single[1], /tarde|noite/.test(single[2]), /manha/.test(single[2]));
      if (t) {
        r.startTime = hhmm(t.h, t.m);
        m = single;
      }
    }
    if (!m && bare) {
      const t = readTime(bare[1], /tarde|noite/.test(bare[2]), /manha/.test(bare[2]));
      if (t) {
        r.startTime = hhmm(t.h, t.m);
        m = bare;
      }
    }
    if (!m && noon) {
      r.startTime = /meia/.test(noon[0]) ? "12:30" : "12:00";
      m = noon;
    }
    if (m && m.index !== undefined && r.startTime) {
      s = cut(s, m.index, m.index + m[0].length);
      r.isEvent = true;
    }
  }
  // Sem horário exato: "de manhã", "à tarde", "à noite" (só para compromissos)
  {
    const n = norm(s);
    const m = n.match(/\b(?:de|pela|a|na|no|durante a)\s+(manha|tarde|noite)\b/);
    if (m && m.index !== undefined) {
      if (r.isEvent && !r.startTime) r.startTime = m[1] === "manha" ? "09:00" : m[1] === "tarde" ? "14:00" : "19:00";
      s = cut(s, m.index, m.index + m[0].length);
    }
  }
  if (r.startTime && !r.endTime) {
    const [h, mi] = r.startTime.split(":").map(Number);
    const total = Math.min(23 * 60 + 59, h * 60 + mi + (r.durationMin ?? 60));
    r.endTime = hhmm(Math.floor(total / 60), total % 60);
  }
  // Responsável (ou participante): @nome ou primeiro nome de pessoa cadastrada
  {
    const n = norm(s);
    let best: { p: NLPerson; idx: number; len: number } | null = null;
    for (const p of ctx.people) {
      const parts = norm(p.name).split(" ");
      const candidates = [parts.join(" "), parts[0]];
      for (const c of candidates) {
        const re = new RegExp(`(^|\\s)@?${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[,.;:])`);
        const m = n.match(re);
        if (m && m.index !== undefined) {
          const idx = m.index + m[1].length;
          const len = m[0].length - m[1].length;
          if (!best || len > best.len) best = { p, idx, len };
          break;
        }
      }
    }
    if (best) {
      r.assigneeId = best.p.id;
      // em compromissos o nome fica no título ("Reunião com o Anderson")
      if (!r.isEvent) {
        s = cut(s, best.idx, best.idx + best.len);
        // "cobrar o Marcos" → tira o "o" que sobrou
        s = trimDangling(s, best.idx).s;
      }
    }
  }

  // Data
  {
    const dm = s.match(/(^|\s)(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|$)/);
    const year = Number(ctx.today.slice(0, 4));
    const [ty, tm, td] = ctx.today.split("-").map(Number);
    if (dm && dm.index !== undefined) {
      const iso = brToISO(dm[2], year);
      if (iso) {
        r.dueDate = iso < ctx.today && !/\/\d{2,4}$/.test(dm[2]) ? `${year + 1}${iso.slice(4)}` : iso;
        const i = dm.index + dm[1].length;
        s = cut(s, i, i + dm[2].length);
      }
    } else {
      const n = norm(s);
      const monthRe = MONTHS.join("|");
      const patterns: [RegExp, (m: RegExpMatchArray) => string | null][] = [
        [/\b(ate |para |pra )?depois de amanha\b/, () => addDaysISO(ctx.today, 2)],
        [/\b(ate |para |pra )?amanha\b/, () => addDaysISO(ctx.today, 1)],
        [/\b(ate |para |pra )?hoje\b/, () => ctx.today],
        [/\b(ate |para |pra )?(a |na )?semana que vem\b/, () => addDaysISO(ctx.today, 7)],
        [/\bem (\d{1,2}) dias?\b/, (m) => addDaysISO(ctx.today, Number(m[1]))],
        [
          new RegExp(String.raw`\b(?:ate |para |pra |no |em )?(?:dia )?(\d{1,2}) de (${monthRe})(?: de (\d{4}))?\b`),
          (m) => {
            const mo = MONTHS.indexOf(m[2]) + 1;
            let y = m[3] ? Number(m[3]) : ty;
            if (!m[3] && (mo < tm || (mo === tm && Number(m[1]) < td))) y++;
            return `${y}-${pad(mo)}-${pad(Number(m[1]))}`;
          },
        ],
        [
          /\b(?:ate o |ate |para o |pra o |no )?dia (\d{1,2})\b/,
          (m) => {
            const d = Number(m[1]);
            if (d < 1 || d > 31) return null;
            let y = ty;
            let mo = tm;
            if (d < td) {
              mo++;
              if (mo > 12) {
                mo = 1;
                y++;
              }
            }
            return `${y}-${pad(mo)}-${pad(d)}`;
          },
        ],
        [
          /\b(ate |para |pra |na |no )?(proxima |prox\.? |que vem )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira)?( que vem)?\b/,
          (m) => {
            const w = WEEKDAY[m[3]];
            let add = (w - weekdayOf(ctx.today) + 7) % 7;
            if (add === 0) add = 7;
            return addDaysISO(ctx.today, add);
          },
        ],
      ];
      for (const [re, fn] of patterns) {
        const m = n.match(re);
        if (m && m.index !== undefined) {
          const v = fn(m);
          if (!v) continue;
          r.dueDate = v;
          s = cut(s, m.index, m.index + m[0].length);
          break;
        }
      }
    }
  }

  // Local: "na sala 2", "na sala de reuniões", "pelo Teams"
  {
    const n = norm(s);
    const room = n.match(/\b(?:na|no)\s+(sala(?:\s+(?:de|da|do)\s+[a-z0-9]+|\s+[a-z0-9]+)?|auditorio|refeitorio|escritorio|recepcao|galpao(?:\s+\d+)?)\b/);
    const online = n.match(/\b(?:pelo|no|via|por|pelo google)\s+(teams|meet|zoom|whatsapp)\b/);
    for (const m of [room, online]) {
      if (!m || m.index === undefined) continue;
      const i = m.index + m[0].length - m[1].length;
      const txt = s.slice(i, i + m[1].length).trim();
      r.location = r.location ? `${r.location} · ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1);
      // em compromisso a sala sai do título; o nome do setor/cliente fica
      s = cut(s, m.index, m.index + m[0].length);
      break;
    }
  }

  // Setor citado pelo nome, sem a palavra "setor": "reunião da qualidade", "ligar pra pintura"
  if (!r.sectorId) {
    const n = norm(s);
    let best: { id: string; len: number } | null = null;
    for (const sec of ctx.sectors) {
      const full = norm(sec.name);
      const keys = [full, full.split(/[\s/]+/)[0], sec.shortName ? norm(sec.shortName) : "", sec.slug.replace(/-/g, " ")].filter((k) => k.length >= 2);
      for (const k of keys) {
        if (k.length < 4 && k !== sec.slug && k !== norm(sec.shortName ?? "")) continue;
        const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
        if (re.test(n) && (!best || k.length > best.len)) best = { id: sec.id, len: k.length };
      }
    }
    if (best) r.sectorId = best.id;
  }

  if (!r.sectorId && r.assigneeId) {
    const p = ctx.people.find((x) => x.id === r.assigneeId);
    if (p?.sectorId) {
      r.sectorId = p.sectorId;
      r.sectorInferred = true;
    }
  }

  // Assuntos pessoais vão para o setor Pessoal
  if (!r.sectorId) {
    const personal = ctx.sectors.find((x) => x.slug === "pessoal");
    if (personal && /\b(medico|medica|dentista|academia|familia|filho|filha|esposa|marido|escola|faculdade|ipva|iptu|aniversario|particular|consulta medica|minha casa|meu carro|mercado|farmacia)\b/.test(norm(raw))) {
      r.sectorId = personal.id;
    }
  }

  let t = s.replace(/\s+/g, " ").replace(/\s([,.;:])/g, "$1").trim();
  t = t.replace(/^[,.;:-]+|[,.;:-]+$/g, "").trim();
  // conectivos soltos no fim ("… com", "… para") depois de remover pessoa/data
  t = t.replace(/\s+(com|para|pra|de|da|do|no|na|em|e|as|às|a|o|ate|até)$/i, "").trim();
  r.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  if (r.kind === "DO" && r.assigneeId && !r.isEvent) r.kind = "DELEGATE";
  return r;
}
