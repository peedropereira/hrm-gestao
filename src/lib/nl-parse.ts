// Interpretador de texto natural em português para criar ações em uma linha.
// Ex.: "cobrar Marcos orçamento compressor sexta #manutencao !"
// Roda no aparelho (sem serviço externo) e também no servidor.

import { addDaysISO, brToISO, weekdayOf } from "./dates";

export type NLPerson = { id: string; name: string; sectorId: string | null };
export type NLSector = { id: string; name: string; shortName: string | null; slug: string };
export type NLKind = "DO" | "DELEGATE" | "FOLLOW_UP" | "DECIDE";

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

/** Remove o trecho [start, end) mantendo espaços. */
function cut(s: string, start: number, end: number) {
  return `${s.slice(0, start)} ${s.slice(end)}`;
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
  };

  // Tipo pelo verbo inicial
  const first = norm(s.trim().split(" ")[0] ?? "");
  if (/^(cobrar|cobra|lembrar|checar|verificar)/.test(first)) r.kind = "FOLLOW_UP";
  else if (/^(decidir|aprovar|definir|escolher|autorizar)/.test(first)) r.kind = "DECIDE";
  else if (/^(delegar|pedir|passar|solicitar)/.test(first)) r.kind = "DELEGATE";

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

  // Responsável: @nome ou primeiro nome de pessoa cadastrada (palavra inteira)
  {
    const n = norm(s);
    let best: { p: NLPerson; idx: number; len: number } | null = null;
    for (const p of ctx.people) {
      const parts = norm(p.name).split(" ");
      // tenta nome completo, depois primeiro nome
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
      s = cut(s, best.idx, best.idx + best.len);
    }
  }

  // Prazo
  {
    const dm = s.match(/(^|\s)(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|$)/);
    const year = Number(ctx.today.slice(0, 4));
    if (dm && dm.index !== undefined) {
      const iso = brToISO(dm[2], year);
      if (iso) {
        r.dueDate = iso < ctx.today && !/\/\d{2,4}$/.test(dm[2]) ? `${year + 1}${iso.slice(4)}` : iso;
        const i = dm.index + dm[1].length;
        s = cut(s, i, i + dm[2].length);
      }
    } else {
      const n = norm(s);
      const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
        [/\b(ate |para |pra )?depois de amanha\b/, () => addDaysISO(ctx.today, 2)],
        [/\b(ate |para |pra )?amanha\b/, () => addDaysISO(ctx.today, 1)],
        [/\b(ate |para |pra )?hoje\b/, () => ctx.today],
        [/\b(ate |para |pra )?(a |na )?semana que vem\b/, () => addDaysISO(ctx.today, 7)],
        [/\bem (\d{1,2}) dias?\b/, (m) => addDaysISO(ctx.today, Number(m[1]))],
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
          r.dueDate = fn(m);
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
  r.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  if (r.kind === "DO" && r.assigneeId) r.kind = "DELEGATE";
  return r;
}
