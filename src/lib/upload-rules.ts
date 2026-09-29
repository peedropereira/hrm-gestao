// Regras de anexos compartilhadas entre o aparelho e o servidor.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB por arquivo
export const MAX_AUDIO_BYTES = 150 * 1024 * 1024; // gravações de reunião

/** Limite por tipo: áudio pode ser maior. */
export function maxBytesFor(mime: string) {
  return isAudio(mime) ? MAX_AUDIO_BYTES : MAX_UPLOAD_BYTES;
}

/** Tipos aceitos pelo armazenamento. */
export const UPLOAD_CONTENT_TYPES = [
  "image/*",
  "audio/*",
  "video/webm", // alguns navegadores gravam áudio como webm de vídeo
  "video/mp4",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // desenhos (DWG/DXF) e outros que o celular não identifica
];

/** Filtro do seletor de arquivos. */
export const FILE_ACCEPT = "image/*,audio/*,.m4a,.mp3,.ogg,.opus,.wav,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.dwg,.dxf";

export type UploadedFile = { url: string; pathname: string; mimeType: string; size: number; name: string };

export function isImage(mime: string) {
  return mime.startsWith("image/");
}

export function isAudio(mime: string, name?: string | null) {
  return mime.startsWith("audio/") || (mime === "video/webm" && !!name?.startsWith("Gravação")) || /\.(m4a|mp3|ogg|opus|wav|aac)$/i.test(name ?? "");
}

/** "12:05" ou "1:02:30" */
export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Tipo curto para exibir: PDF, Word, Excel… */
export function fileKind(mime: string, name?: string | null): string {
  const ext = (name?.split(".").pop() ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "Foto";
  if (isAudio(mime, name)) return "Áudio";
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (mime.includes("word") || ext === "doc" || ext === "docx") return "Word";
  if (mime.includes("sheet") || mime.includes("excel") || ext === "xls" || ext === "xlsx" || ext === "csv") return "Planilha";
  if (mime.includes("presentation") || mime.includes("powerpoint") || ext === "ppt" || ext === "pptx") return "Apresentação";
  if (ext === "dwg" || ext === "dxf") return "Desenho";
  if (mime.includes("zip") || ext === "zip") return "ZIP";
  if (mime.startsWith("text/")) return "Texto";
  return "Arquivo";
}
