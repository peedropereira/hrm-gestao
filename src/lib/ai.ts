import "server-only";

// Serviços de IA opcionais. Cada um só funciona se a chave estiver nas variáveis da Vercel.
// - OPENAI_API_KEY: transcrição do áudio das reuniões (fala → texto).
// - ANTHROPIC_API_KEY: redação da ata a partir da transcrição e interpretação da captura.

export function aiConfig() {
  return { transcribe: !!process.env.OPENAI_API_KEY, write: !!process.env.ANTHROPIC_API_KEY };
}

/** Limite da API de transcrição por arquivo. */
export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

function extFor(mime: string, name: string | null) {
  const fromName = name?.match(/\.(\w{2,5})$/)?.[1]?.toLowerCase();
  if (fromName && ["webm", "mp4", "m4a", "mp3", "mpeg", "mpga", "ogg", "oga", "wav", "flac"].includes(fromName)) return fromName;
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

/** Transcreve um áudio já guardado no Blob. `hint` ajuda com nomes próprios. */
export async function transcribeAudio(a: { url: string; mimeType: string; name: string | null; size: number }, hint: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("A transcrição automática ainda não foi configurada (OPENAI_API_KEY na Vercel).");
  if (a.size > TRANSCRIBE_MAX_BYTES) throw new Error("Áudio muito grande para transcrever de uma vez (máx. 25 MB). Grave pelo app, que divide em partes.");
  const audio = await fetch(a.url);
  if (!audio.ok) throw new Error("Não foi possível ler o áudio guardado.");
  const form = new FormData();
  form.append("file", await audio.blob(), `audio.${extFor(a.mimeType, a.name)}`);
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  form.append("language", "pt");
  form.append("response_format", "text");
  form.append("prompt", hint.slice(0, 800));
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) {
    console.error("transcrição falhou", res.status, await res.text().catch(() => ""));
    throw new Error("O serviço de transcrição não respondeu. Tente de novo em instantes.");
  }
  return (await res.text()).trim();
}

/** Texto livre com o Claude (ata, resumos). */
export async function writeWithClaude(system: string, prompt: string, maxTokens = 2000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("A redação automática ainda não foi configurada (ANTHROPIC_API_KEY na Vercel).");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_ATA || "claude-sonnet-5-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("Claude falhou", res.status, await res.text().catch(() => ""));
      throw new Error("O serviço de redação não respondeu. Tente de novo em instantes.");
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Categoriza estabelecimentos que as regras não reconheceram (precisa de ANTHROPIC_API_KEY).
 * Devolve { descrição → nome da categoria }.
 */
export async function categorizeWithAI(descriptions: string[], categoryNames: string[]): Promise<Record<string, string>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !descriptions.length) return {};
  const list = [...new Set(descriptions)].slice(0, 200);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        tools: [
          {
            name: "categorizar",
            description: "Associa cada compra de cartão a uma categoria.",
            input_schema: {
              type: "object",
              properties: {
                itens: {
                  type: "array",
                  items: { type: "object", properties: { descricao: { type: "string" }, categoria: { type: "string", enum: [...categoryNames, "?"] } }, required: ["descricao", "categoria"] },
                },
              },
              required: ["itens"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "categorizar" },
        messages: [
          {
            role: "user",
            content: `Compras de cartão de crédito de uma pessoa em Mogi das Cruzes/SP. Deduza pelo nome do estabelecimento a categoria mais provável. Use "?" só se for impossível deduzir.\n\n${list.join("\n")}`,
          },
        ],
      }),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { content?: { type: string; input?: { itens: { descricao: string; categoria: string }[] } }[] };
    const itens = json.content?.find((c) => c.type === "tool_use")?.input?.itens ?? [];
    return Object.fromEntries(itens.filter((i) => i.categoria !== "?" && categoryNames.includes(i.categoria)).map((i) => [i.descricao, i.categoria]));
  } catch {
    return {};
  }
}
