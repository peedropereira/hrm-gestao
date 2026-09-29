"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileAudio,
  FileText,
  Loader2,
  Paperclip,
  PenTool,
  Presentation,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { attachFiles, removeAttachment, restoreAttachment } from "@/app/actions/attachments";
import { uploadFiles } from "@/lib/upload-client";
import { FILE_ACCEPT, fileKind, formatBytes, formatDuration, isAudio, isImage } from "@/lib/upload-rules";
import { formatDateTimeShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttachmentDTO } from "@/lib/types";

const KIND_ICON = {
  Foto: FileImage,
  "Áudio": FileAudio,
  PDF: FileText,
  Word: FileText,
  Planilha: FileSpreadsheet,
  "Apresentação": Presentation,
  Desenho: PenTool,
  ZIP: FileArchive,
  Texto: FileText,
  Arquivo: FileIcon,
} as const;

/** Dois botões: câmera direta e seletor de arquivos (fotos da galeria e documentos). */
export function AttachButtons({
  onFiles,
  disabled,
  size = "md",
  className,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  size?: "md" | "sm";
  className?: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length) onFiles(list);
  };
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={take} />
      <input ref={picker} type="file" accept={FILE_ACCEPT} multiple hidden onChange={take} />
      <Button type="button" variant="secondary" size={size} disabled={disabled} onClick={() => camera.current?.click()}>
        <Camera /> Tirar foto
      </Button>
      <Button type="button" variant="secondary" size={size} disabled={disabled} onClick={() => picker.current?.click()}>
        <Paperclip /> Anexar arquivo
      </Button>
    </div>
  );
}

/** Arquivos escolhidos que ainda vão ser enviados. */
export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((f, i) => {
        const Icon = KIND_ICON[fileKind(f.type, f.name) as keyof typeof KIND_ICON] ?? FileIcon;
        return (
          <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-[8px] bg-surface-2 py-1 pl-2 pr-1 text-[13px]">
            <Icon className="size-3.5 shrink-0 text-fg-3" />
            <span className="truncate">{f.name || "foto.jpg"}</span>
            <span className="shrink-0 text-fg-3">{formatBytes(f.size)}</span>
            <button type="button" onClick={() => onRemove(i)} className="grid size-7 shrink-0 place-items-center rounded-[6px] hover:bg-line" aria-label={`Remover ${f.name}`}>
              <X className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Mostra fotos em miniatura (toque amplia) e documentos em lista. */
export function AttachmentList({
  items,
  onRemoved,
  removable = true,
  showSource,
  empty,
}: {
  items: AttachmentDTO[];
  onRemoved?: () => void;
  removable?: boolean;
  showSource?: boolean;
  empty?: ReactNode;
}) {
  const [viewer, setViewer] = useState<AttachmentDTO | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = items.filter((a) => !hidden.has(a.id));
  const photos = visible.filter((a) => isImage(a.mimeType));
  const docs = visible.filter((a) => !isImage(a.mimeType));

  const remove = async (a: AttachmentDTO) => {
    setHidden((h) => new Set(h).add(a.id));
    setViewer(null);
    const r = await removeAttachment(a.id);
    if (!r.ok || !r.data) {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(a.id);
        return n;
      });
      return void toast.error(r.ok ? "Não foi possível remover." : r.error);
    }
    const snap = r.data.snapshot;
    onRemoved?.();
    toast.success("Anexo removido", {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const u = await restoreAttachment(snap);
          if (u.ok) {
            setHidden((h) => {
              const n = new Set(h);
              n.delete(a.id);
              return n;
            });
            onRemoved?.();
          }
        },
      },
    });
  };

  if (!visible.length) return <>{empty ?? null}</>;

  return (
    <div className="grid gap-3">
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setViewer(p)}
                className="relative block aspect-square w-full overflow-hidden rounded-[10px] border border-line bg-surface-2"
                aria-label={`Ampliar ${p.name ?? "foto"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name ?? "Foto anexada"} loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {docs.length > 0 && (
        <ul className="overflow-hidden rounded-[12px] border border-line">
          {docs.map((d) => {
            const kind = fileKind(d.mimeType, d.name);
            const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? FileIcon;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-surface px-3 py-2 first:border-t-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-ac-soft text-ac-text">
                  <Icon className="size-5" />
                </span>
                <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 py-1">
                  <span className="block truncate text-[15px] font-medium md:text-[14px]">{d.name ?? kind}</span>
                  <span className="block truncate text-[13px] text-fg-3">
                    {kind} · {d.durationSec ? `${formatDuration(d.durationSec)} · ` : ""}
                    {formatBytes(d.size)} · {formatDateTimeShort(new Date(d.createdAt))}
                    {showSource && d.source ? ` · ${d.source}` : ""}
                  </span>
                </a>
                <a href={d.url} target="_blank" rel="noreferrer" className="grid size-10 shrink-0 place-items-center rounded-[10px] text-fg-2 hover:bg-surface-2" aria-label={`Abrir ${d.name ?? kind}`}>
                  <Download className="size-[18px]" />
                </a>
                {removable && (
                  <button type="button" onClick={() => void remove(d)} className="grid size-10 shrink-0 place-items-center rounded-[10px] text-fg-3 hover:bg-surface-2" aria-label={`Remover ${d.name ?? kind}`}>
                    <Trash2 className="size-4" />
                  </button>
                )}
                {isAudio(d.mimeType, d.name) && <audio controls preload="none" src={d.url} className="h-10 w-full basis-full" aria-label={`Ouvir ${d.name ?? "áudio"}`} />}
              </li>
            );
          })}
        </ul>
      )}
      {viewer && <PhotoViewer a={viewer} onClose={() => setViewer(null)} onRemove={removable ? () => void remove(viewer) : undefined} showSource={showSource} />}
    </div>
  );
}

function PhotoViewer({ a, onClose, onRemove, showSource }: { a: AttachmentDTO; onClose: () => void; onRemove?: () => void; showSource?: boolean }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white" role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1 text-[14px]">
          <b className="block truncate font-semibold">{a.name ?? "Foto"}</b>
          <span className="text-white/60">
            {formatDateTimeShort(new Date(a.createdAt))}
            {showSource && a.source ? ` · ${a.source}` : ""}
          </span>
        </div>
        <a href={a.url} target="_blank" rel="noreferrer" className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Abrir original">
          <Download className="size-5" />
        </a>
        {onRemove && (
          <button type="button" onClick={onRemove} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Remover foto">
            <Trash2 className="size-5" />
          </button>
        )}
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Fechar" autoFocus>
          <X className="size-6" />
        </button>
      </div>
      <button type="button" className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={onClose} aria-label="Fechar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name ?? "Foto anexada"} className="max-h-full max-w-full object-contain" />
      </button>
    </div>,
    document.body,
  );
}

/** Bloco completo: escolher, enviar e ligar a um setor, demanda, necessidade ou nota. */
export function AttachmentUploader({
  target,
  items,
  onChanged,
  showSource,
  empty,
}: {
  target: { kind: "sector" | "demand" | "need" | "note" | "inbox" | "event"; id: string };
  items: AttachmentDTO[];
  onChanged?: () => void;
  showSource?: boolean;
  empty?: ReactNode;
}) {
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);

  const send = (files: File[]) =>
    start(async () => {
      try {
        const up = await uploadFiles(files, (i, total, pct) => setProgress(total > 1 ? `Enviando ${i} de ${total} · ${pct}%` : `Enviando · ${pct}%`));
        const r = await attachFiles(target, up);
        if (!r.ok) return void toast.error(r.error);
        toast.success(files.length === 1 ? "Arquivo anexado" : `${files.length} arquivos anexados`);
        onChanged?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
      } finally {
        setProgress(null);
      }
    });

  return (
    <div className="grid gap-3">
      <AttachButtons onFiles={send} disabled={pending} />
      {progress && (
        <p className="flex items-center gap-2 text-[14px] font-medium text-ac-text" role="status">
          <Loader2 className="size-4 animate-spin" /> {progress}
        </p>
      )}
      <AttachmentList items={items} onRemoved={onChanged} showSource={showSource} empty={empty} />
    </div>
  );
}

/** Envia arquivos pendentes depois que o registro foi salvo (ex.: nova demanda). */
export async function uploadAndAttach(target: { kind: "sector" | "demand" | "need" | "note" | "inbox" | "event"; id: string }, files: File[]) {
  if (!files.length) return true;
  try {
    const up = await uploadFiles(files);
    const r = await attachFiles(target, up);
    if (!r.ok) toast.error(r.error);
    return r.ok;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    return false;
  }
}
