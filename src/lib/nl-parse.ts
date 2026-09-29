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

export function parseNL(
  raw: string,
  ctx: { today: string; people: NLPerson[]; sectors: NLSector[] },
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

  // Horário: "das 9 às 10h30", "às 14h", "14:30", "14 horas", "meio-dia"
  {
    const n = norm(s);
    const H = String.raw`(\d{1,2})(?:(?:[:h]|\s*horas?\s*e\s*|\s*e\s*)(\d{2}|meia))?\s*(?:h(?:oras?|rs?)?\b)?`;
    const range = n.match(new RegExp(String.raw`\b(?:das|de)\s+${H}\s*(?:as|a|ate)\s+${H}`));
    const single = n.match(new RegExp(String.raw`\b(?:as|a partir das|por volta das)\s+${H}`));
    const bare = n.match(/\b(\d{1,2})(?:[:h](\d{2}))\b|\b(\d{1,2})\s?(?:h|horas)\b/);
    const noon = n.match(/\b(?:ao |as )?meio[- ]dia\b/);
    const min = (x: string | undefined) => (x === "meia" ? 30 : x ? Number(x) : 0);
    let m: RegExpMatchArray | null = null;
    if (range) {
      r.startTime = hhmm(Number(range[1]), min(range[2]));
      r.endTime = hhmm(Number(range[3]), min(range[4]));
      m = range;
    } else if (single) {
      r.startTime = hhmm(Number(single[1]), min(single[2]));
      m = single;
    } else if (bare) {
      r.startTime = bare[3] ? hhmm(Number(bare[3])) : hhmm(Number(bare[1]), Number(bare[2]));
      m = bare;
    } else if (noon) {
      r.startTime = "12:00";
      m = noon;
    }
    if (m && m.index !== undefined && r.startTime) {
      s = cut(s, m.index, m.index + m[0].length);
      r.isEvent = true;
      if (!r.endTime) {
        const [h, mi] = r.startTime.split(":").map(Number);
        r.endTime = hhmm(Math.min(23, h + 1), mi);
      }
    }
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

  if (!r.sectorId && r.assigneeId) {
    const p = ctx.people.find((x) => x.id === r.assigneeId);
    if (p?.sectorId) {
      r.sectorId = p.sectorId;
      r.sectorInferred = true;
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
