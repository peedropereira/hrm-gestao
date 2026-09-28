"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Camera, Check, Clock, History, Loader2, MessageCircle, Paperclip, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { FollowUpLine, SnoozeSheet } from "@/components/action-bits";
import { DueBadge, KindLabel } from "@/components/ds";
import { Button } from "@/components/button";
import { addActionUpdate, addSubtask, deleteSubtask, toggleSubtask, updateAction } from "@/app/actions/actions";
import { formatDateTimeShort } from "@/lib/dates";
import { KIND_LABEL, ORIGIN_LABEL, STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionDTO } from "@/lib/types";
import type { ActionExtra } from "@/lib/types";

/** Reduz a foto no aparelho antes de enviar (lado maior 1600 px, JPEG 80%). */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const field = "h-11 w-full rounded-[10px] border border-line bg-bg px-3 text-[16px] md:h-9 md:text-[14px] outline-none focus:border-ac";
const label = "text-[14px] text-fg-3 md:text-[13px]";

export function ActionDetail({ action: a, compact, initialExtra }: { action: ActionDTO; compact?: boolean; initialExtra?: ActionExtra }) {
  const { today, sectors, people, complete, reopen, remove } = useApp();
  const router = useRouter();
  const [extra, setExtra] = useState<ActionExtra | null>(initialExtra ?? null);
  const [snoozing, setSnoozing] = useState(false);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(a.title);
  const [desc, setDesc] = useState(a.description ?? "");
  const [newSub, setNewSub] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/acoes/${a.id}`);
    if (r.ok) setExtra(await r.json());
  }, [a.id]);

  useEffect(() => {
    if (initialExtra) return;
    let alive = true;
    fetch(`/api/acoes/${a.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: ActionExtra | null) => {
        if (alive && j) setExtra(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [a.id, initialExtra]);

  const save = (patch: Parameters<typeof updateAction>[1], msg?: string) =>
    start(async () => {
      const r = await updateAction(a.id, patch);
      if (!r.ok) toast.error(r.error);
      else if (msg) toast.success(msg);
    });

  const sendUpdate = (kind: "COMMENT" | "FOLLOW_UP" | "EVIDENCE") =>
    start(async () => {
      const uploaded = [];
      for (const f of files) {
        const body = new FormData();
        body.append("file", await compressImage(f));
        const r = await fetch("/api/upload", { method: "POST", body });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          toast.error(j.error ?? "Não foi possível enviar a foto.");
          return;
        }
        uploaded.push(j);
      }
      const r = await addActionUpdate(a.id, { kind: files.length && kind === "COMMENT" ? "EVIDENCE" : kind, text: note || null, attachments: uploaded });
      if (!r.ok) return void toast.error(r.error);
      toast.success(kind === "FOLLOW_UP" ? "Cobrança registrada" : "Registrado");
      setNote("");
      setFiles([]);
      await load();
    });

  const done = a.status === "DONE";
  const photos = extra?.updates.flatMap((u) => u.attachments.filter((x) => x.mimeType.startsWith("image/")).map((x) => ({ ...x, at: u.createdAt }))) ?? [];

  return (
    <div className={cn("grid gap-5", compact ? "p-5" : "px-4 pb-8 md:px-0")}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <DueBadge a={a} today={today} />
          <KindLabel kind={a.kind} />
          <span className="text-[14px] text-fg-3 md:text-[13px]">· {STATUS_LABEL[a.status]}</span>
        </div>
        <label htmlFor={`t-${a.id}`} className="sr-only">
          Título
        </label>
        <textarea
          id={`t-${a.id}`}
          value={title}
          rows={2}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== a.title && save({ title: title.trim() })}
          className={cn("w-full resize-none rounded-[8px] bg-transparent font-bold leading-snug tracking-[-0.015em] outline-none focus:bg-bg focus:ring-2 focus:ring-ac", compact ? "text-[19px]" : "text-[24px]", done && "text-fg-3 line-through")}
        />
        <FollowUpLine a={a} />
        <div className="flex flex-wrap gap-2">
          {done ? (
            <Button size={compact ? "sm" : "md"} variant="secondary" onClick={() => reopen(a)}>
              <RotateCcw /> Reabrir
            </Button>
          ) : (
            <Button size={compact ? "sm" : "md"} onClick={() => complete(a)}>
              <Check /> Concluir
            </Button>
          )}
          {!done && (
            <Button size={compact ? "sm" : "md"} variant="secondary" onClick={() => setSnoozing(true)}>
              <Clock /> Adiar
            </Button>
          )}
          {a.assigneeId && !done && (
            <Button size={compact ? "sm" : "md"} variant="secondary" disabled={pending} onClick={() => sendUpdate("FOLLOW_UP")}>
              <BellRing /> Registrar cobrança
            </Button>
          )}
          <Button
            size={compact ? "sm" : "md"}
            variant="quiet"
            onClick={() => {
              remove(a);
              if (!compact) router.push("/acoes");
            }}
          >
            <Trash2 /> Excluir
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-[112px_1fr] items-center gap-x-3 gap-y-2.5">
        <dt className={label}>Setor</dt>
        <dd>
          <select aria-label="Setor" className={field} value={a.sectorId ?? ""} onChange={(e) => save({ sectorId: e.target.value || null })}>
            <option value="">Sem setor</option>
            {sectors.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>
                {s.parentId ? `  ${s.name}` : s.name}
              </option>
            ))}
          </select>
        </dd>
        <dt className={label}>Responsável</dt>
        <dd>
          <select aria-label="Responsável" className={field} value={a.assigneeId ?? ""} onChange={(e) => save({ assigneeId: e.target.value || null })}>
            <option value="">Eu mesmo</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </dd>
        <dt className={label}>Tipo</dt>
        <dd>
          <select aria-label="Tipo" className={field} value={a.kind} onChange={(e) => save({ kind: e.target.value as ActionDTO["kind"] })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </dd>
        <dt className={label}>Prazo</dt>
        <dd>
          <input type="date" aria-label="Prazo" className={field} value={a.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} />
        </dd>
        <dt className={label}>Status</dt>
        <dd>
          <select aria-label="Status" className={field} value={a.status} onChange={(e) => save({ status: e.target.value as ActionDTO["status"] })}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </dd>
        <dt className={label}>Prioridade</dt>
        <dd className="flex gap-2">
          {(
            [
              ["urgent", "Urgente", a.urgent],
              ["important", "Importante", a.important],
            ] as const
          ).map(([k, l, on]) => (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => save({ [k]: !on })}
              className={cn("h-11 flex-1 rounded-[10px] border text-[15px] font-semibold md:h-9 md:text-[13px]", on ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg-2")}
            >
              {l}
            </button>
          ))}
        </dd>
        {a.assigneeId && (
          <>
            <dt className={label}>Alertar após</dt>
            <dd className="flex items-center gap-2 text-[14px] text-fg-2">
              <input
                type="number"
                min={1}
                max={60}
                aria-label="Dias úteis sem retorno para alertar"
                className={cn(field, "w-20")}
                defaultValue={a.alertAfterDays ?? ""}
                placeholder="3"
                onBlur={(e) => save({ alertAfterDays: e.target.value ? Number(e.target.value) : null })}
              />
              dias úteis sem retorno
            </dd>
          </>
        )}
        <dt className={label}>Tags</dt>
        <dd>
          <input
            aria-label="Tags, separadas por vírgula"
            className={field}
            defaultValue={a.tags.join(", ")}
            placeholder="ex.: vp-2210, cliente"
            onBlur={(e) => {
              const tags = e.target.value.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
              if (tags.join(",") !== a.tags.join(",")) save({ tags });
            }}
          />
        </dd>
        <dt className={label}>Origem</dt>
        <dd className="text-[14px] text-fg-2">
          {ORIGIN_LABEL[a.origin]}
          {a.originNote ? ` · ${a.originNote}` : ""}
        </dd>
      </dl>

      <section>
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.07em] text-fg-3">Descrição</h3>
        <textarea
          aria-label="Descrição"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (a.description ?? "") && save({ description: desc || null })}
          rows={3}
          placeholder="Detalhes, contexto, combinados…"
          className="w-full rounded-[10px] border border-line bg-bg p-3 text-[16px] leading-relaxed outline-none focus:border-ac md:text-[14px]"
        />
      </section>

      <section>
        <h3 className="mb-1 flex justify-between text-[12px] font-bold uppercase tracking-[0.07em] text-fg-3">
          Subações
          {extra && extra.subtasks.length > 0 && (
            <span>
              {extra.subtasks.filter((s) => s.done).length}/{extra.subtasks.length}
            </span>
          )}
        </h3>
        <ul>
          {extra?.subtasks.map((s) => (
            <li key={s.id} className="group flex min-h-11 items-center gap-2.5">
              <input
                type="checkbox"
                checked={s.done}
                aria-label={s.title}
                onChange={() =>
                  start(async () => {
                    await toggleSubtask(s.id, !s.done);
                    await load();
                  })
                }
                className="size-5 shrink-0 accent-[var(--green-solid)]"
              />
              <span className={cn("flex-1 text-[15px] md:text-[14px]", s.done && "text-fg-3 line-through")}>{s.title}</span>
              <button
                type="button"
                aria-label={`Remover subação ${s.title}`}
                className="grid size-9 place-items-center rounded-[8px] text-fg-3 opacity-60 hover:bg-surface-2 hover:opacity-100"
                onClick={() =>
                  start(async () => {
                    await deleteSubtask(s.id);
                    await load();
                  })
                }
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newSub.trim()) return;
            start(async () => {
              const r = await addSubtask(a.id, newSub);
              if (!r.ok) return void toast.error(r.error);
              setNewSub("");
              await load();
            });
          }}
        >
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nova subação" aria-label="Nova subação" className={field} />
          <Button type="submit" variant="secondary" size={compact ? "sm" : "md"} disabled={!newSub.trim() || pending} aria-label="Adicionar subação">
            <Plus />
          </Button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.07em] text-fg-3">Evidências e comentários</h3>
        {photos.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="relative block size-[88px] overflow-hidden rounded-[10px] border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Evidência de ${formatDateTimeShort(new Date(p.at))}`} loading="lazy" className="size-full object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className="grid gap-2 rounded-[12px] border border-line bg-bg p-2.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Comentário, combinado ou evidência…"
            aria-label="Comentário"
            className="w-full resize-none bg-transparent p-1 text-[16px] outline-none md:text-[14px]"
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-[8px] bg-surface-2 px-2 py-1 text-[13px]">
                  <Paperclip className="size-3.5" />
                  {f.name.slice(0, 24)}
                  <button type="button" aria-label="Remover anexo" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input ref={fileInput} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6))} />
            <Button variant="secondary" size={compact ? "sm" : "md"} onClick={() => fileInput.current?.click()}>
              <Camera /> Foto
            </Button>
            <Button size={compact ? "sm" : "md"} className="ml-auto" disabled={pending || (!note.trim() && !files.length)} onClick={() => sendUpdate("COMMENT")}>
              {pending ? <Loader2 className="animate-spin" /> : <MessageCircle />} Registrar
            </Button>
          </div>
        </div>
      </section>

      {extra && extra.updates.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.07em] text-fg-3">Histórico</h3>
          <ul className="grid gap-3">
            {extra.updates.map((u) => (
              <li key={u.id} className="grid grid-cols-[18px_1fr] gap-2 text-[14px] text-fg-2 md:text-[13px]">
                {u.kind === "FOLLOW_UP" ? <BellRing className="mt-0.5 size-4 text-fg-3" /> : u.kind === "EVIDENCE" ? <Camera className="mt-0.5 size-4 text-fg-3" /> : <History className="mt-0.5 size-4 text-fg-3" />}
                <div>
                  <time className="block font-mono text-[12px] text-fg-3">{formatDateTimeShort(new Date(u.createdAt))}</time>
                  {u.kind === "FOLLOW_UP" && <b className="font-semibold text-fg">Cobrança · </b>}
                  {u.text}
                  {u.attachments.length > 0 && ` (${u.attachments.length} ${u.attachments.length === 1 ? "anexo" : "anexos"})`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SnoozeSheet a={a} open={snoozing} onClose={() => setSnoozing(false)} />
    </div>
  );
}
