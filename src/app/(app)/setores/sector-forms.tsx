"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/button";
import { SECTOR_ICONS } from "@/components/icon";
import { useApp } from "@/components/app-provider";
import { saveDemand, saveNeed, saveNote, savePerson, saveSector } from "@/app/actions/sectors";
import { DEMAND_STATUS_LABEL, NEED_CATEGORY_LABEL, NEED_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AttachmentDTO, PersonDTO, SectorDTO } from "@/lib/types";
import { AttachButtons, AttachmentList, PendingFiles, uploadAndAttach } from "@/components/attachments";

export const inputCls = "h-12 w-full rounded-[12px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)] md:h-10 md:text-[14px]";

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[15px] font-semibold md:text-[13px]">
        {label}
      </label>
      {children}
      {hint && <small className="text-[13px] text-fg-3">{hint}</small>}
    </div>
  );
}

function useSave() {
  const [pending, start] = useTransition();
  /** Salva; se houver arquivos escolhidos, envia e liga ao registro salvo. */
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>,
    msg: string,
    done: () => void,
    attach?: { kind: "demand" | "need" | "note"; files: File[] },
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      const savedId = (r.data as { id?: string } | undefined)?.id;
      if (attach?.files.length && savedId) {
        const ok = await uploadAndAttach({ kind: attach.kind, id: savedId }, attach.files);
        if (!ok) return; // registro salvo; o erro do anexo já foi mostrado
      }
      toast.success(msg);
      done();
    });
  return { pending, run };
}

/** Anexos dentro dos formulários: os que já existem e os novos a enviar. */
function FormFiles({ existing, files, setFiles, disabled }: { existing: AttachmentDTO[]; files: File[]; setFiles: (f: File[]) => void; disabled: boolean }) {
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-1 text-[15px] font-semibold md:text-[13px]">Fotos e documentos</legend>
      <AttachmentList items={existing} />
      <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
      <AttachButtons disabled={disabled} onFiles={(f) => setFiles([...files, ...f].slice(0, 10))} />
    </fieldset>
  );
}

const COLORS = ["#8B5CF6", "#6366F1", "#3B82F6", "#0EA5E9", "#06B6D4", "#14B8A6", "#10B981", "#84CC16", "#EAB308", "#A16207", "#F97316", "#F43F5E", "#EC4899", "#D946EF", "#64748B"];

// ---------- Setor ----------
export function SectorForm({ sector, open, onClose }: { sector?: SectorDTO; open: boolean; onClose: () => void }) {
  const { sectors } = useApp();
  const router = useRouter();
  const { pending, run } = useSave();
  const [name, setName] = useState(sector?.name ?? "");
  const [shortName, setShortName] = useState(sector?.shortName ?? "");
  const [color, setColor] = useState(sector?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(sector?.icon ?? "building");
  const [parentId, setParentId] = useState(sector?.parentId ?? "");
  const [active, setActive] = useState(sector?.active ?? true);

  return (
    <Sheet open={open} onClose={onClose} title={sector ? "Editar setor" : "Novo setor"} wide>
      <form
        className="grid gap-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveSector(sector?.id ?? null, { name, shortName, color, icon, parentId: parentId || null, active }).then((r) => {
              if (r.ok && !sector && r.data) router.push(`/setores/${r.data.slug}`);
              return r;
            }),
            "Setor salvo",
            onClose,
          );
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" htmlFor="s-name">
            <input id="s-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Nome curto (opcional)" htmlFor="s-short">
            <input id="s-short" className={inputCls} value={shortName} onChange={(e) => setShortName(e.target.value)} />
          </Field>
        </div>
        <Field label="Subsetor de" htmlFor="s-parent">
          <select id="s-parent" className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nenhum (setor principal)</option>
            {sectors.filter((s) => !s.parentId && s.id !== sector?.id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-[15px] font-semibold md:text-[13px]">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-10 rounded-full border-4", color === c ? "border-fg" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[15px] font-semibold md:text-[13px]">Ícone</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SECTOR_ICONS).map(([k, I]) => (
              <button
                key={k}
                type="button"
                aria-label={`Ícone ${k}`}
                aria-pressed={icon === k}
                onClick={() => setIcon(k)}
                className={cn("sector-tile grid size-11 place-items-center rounded-[10px] border-2", icon === k ? "border-fg" : "border-transparent")}
                style={{ "--sc": color } as React.CSSProperties}
              >
                <I className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
        {sector && (
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--ac)]" />
            Setor ativo (desmarque para esconder sem apagar)
          </label>
        )}
        <Button type="submit" block disabled={pending}>
          Salvar setor
        </Button>
      </form>
    </Sheet>
  );
}

export function NewSectorButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus /> Novo setor
      </Button>
      {open && <SectorForm open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------- Pessoa ----------
export function PersonForm({ person, sectorId, open, onClose }: { person?: PersonDTO; sectorId: string; open: boolean; onClose: () => void }) {
  const { sectors } = useApp();
  const { pending, run } = useSave();
  const [f, setF] = useState({
    name: person?.name ?? "",
    role: person?.role ?? "",
    phone: person?.phone ?? "",
    whatsapp: person?.whatsapp ?? "",
    email: person?.email ?? "",
    sectorId: person?.sectorId ?? sectorId,
    isLeader: person?.isLeader ?? false,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open={open} onClose={onClose} title={person ? "Editar pessoa" : "Nova pessoa"} wide>
      <form
        className="grid gap-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => savePerson(person?.id ?? null, f), "Pessoa salva", onClose);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" htmlFor="p-name">
            <input id="p-name" className={inputCls} value={f.name} onChange={set("name")} required autoComplete="off" />
          </Field>
          <Field label="Cargo" htmlFor="p-role">
            <input id="p-role" className={inputCls} value={f.role} onChange={set("role")} />
          </Field>
          <Field label="Telefone" htmlFor="p-phone">
            <input id="p-phone" type="tel" inputMode="tel" className={inputCls} value={f.phone} onChange={set("phone")} placeholder="(11) 90000-0000" />
          </Field>
          <Field label="WhatsApp" htmlFor="p-wa" hint="Deixe vazio se for o mesmo do telefone.">
            <input id="p-wa" type="tel" inputMode="tel" className={inputCls} value={f.whatsapp} onChange={set("whatsapp")} />
          </Field>
          <Field label="E-mail" htmlFor="p-mail">
            <input id="p-mail" type="email" className={inputCls} value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Setor" htmlFor="p-sector">
            <select id="p-sector" className={inputCls} value={f.sectorId} onChange={set("sectorId")}>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" checked={f.isLeader} onChange={(e) => setF({ ...f, isLeader: e.target.checked })} className="size-5 accent-[var(--ac)]" />
          É o líder do setor
        </label>
        <Button type="submit" block disabled={pending}>
          Salvar pessoa
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Necessidade ----------
export type NeedRow = {
  id: string;
  sectorId: string;
  title: string;
  details: string | null;
  category: keyof typeof NEED_CATEGORY_LABEL;
  estimatedCost: number | null;
  recurring: boolean;
  priority: keyof typeof PRIORITY_LABEL;
  status: keyof typeof NEED_STATUS_LABEL;
};

export function NeedForm({ need, sectorId, files: existing = [], open, onClose }: { need?: NeedRow; sectorId: string; files?: AttachmentDTO[]; open: boolean; onClose: () => void }) {
  const { pending, run } = useSave();
  const [files, setFiles] = useState<File[]>([]);
  const [f, setF] = useState({
    title: need?.title ?? "",
    details: need?.details ?? "",
    category: need?.category ?? "EQUIPMENT",
    cost: need?.estimatedCost != null ? String(need.estimatedCost).replace(".", ",") : "",
    recurring: need?.recurring ?? false,
    priority: need?.priority ?? "MEDIUM",
    status: need?.status ?? "RAISED",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open={open} onClose={onClose} title={need ? "Editar necessidade" : "Nova necessidade"} wide>
      <form
        className="grid gap-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = f.cost.trim() ? Number(f.cost.replace(/\./g, "").replace(",", ".")) : null;
          if (n !== null && Number.isNaN(n)) return void toast.error("Custo inválido. Use números, ex.: 185.000,00");
          run(
            () =>
              saveNeed(need?.id ?? null, {
                sectorId: need?.sectorId ?? sectorId,
                title: f.title,
                details: f.details,
                category: f.category,
                estimatedCost: n,
                recurring: f.recurring,
                priority: f.priority,
                status: f.status,
              }),
            "Necessidade salva",
            onClose,
            { kind: "need", files },
          );
        }}
      >
        <Field label="O que o setor precisa" htmlFor="n-title">
          <input id="n-title" className={inputCls} value={f.title} onChange={set("title")} required />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Categoria" htmlFor="n-cat">
            <select id="n-cat" className={inputCls} value={f.category} onChange={set("category")}>
              {Object.entries(NEED_CATEGORY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custo estimado (R$)" htmlFor="n-cost">
            <input id="n-cost" inputMode="decimal" className={inputCls} value={f.cost} onChange={set("cost")} placeholder="0,00" />
          </Field>
          <Field label="Prioridade" htmlFor="n-prio">
            <select id="n-prio" className={inputCls} value={f.priority} onChange={set("priority")}>
              {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="n-status">
            <select id="n-status" className={inputCls} value={f.status} onChange={set("status")}>
              {Object.entries(NEED_STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} className="size-5 accent-[var(--ac)]" />
          Custo mensal (recorrente)
        </label>
        <Field label="Detalhes" htmlFor="n-det">
          <textarea id="n-det" rows={3} className={cn(inputCls, "h-auto py-3")} value={f.details} onChange={set("details")} />
        </Field>
        <FormFiles existing={existing} files={files} setFiles={setFiles} disabled={pending} />
        <Button type="submit" block disabled={pending}>
          {pending ? "Salvando…" : "Salvar necessidade"}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Demanda ----------
export type DemandRow = {
  id: string;
  sectorId: string;
  title: string;
  details: string | null;
  source: string | null;
  receivedAt: string;
  dueDate: string | null;
  priority: keyof typeof PRIORITY_LABEL;
  status: keyof typeof DEMAND_STATUS_LABEL;
};

export function DemandForm({ demand, sectorId, files: existing = [], open, onClose }: { demand?: DemandRow; sectorId: string; files?: AttachmentDTO[]; open: boolean; onClose: () => void }) {
  const { today } = useApp();
  const { pending, run } = useSave();
  const [files, setFiles] = useState<File[]>([]);
  const [f, setF] = useState({
    title: demand?.title ?? "",
    details: demand?.details ?? "",
    source: demand?.source ?? "",
    receivedAt: demand?.receivedAt ?? today,
    dueDate: demand?.dueDate ?? "",
    priority: demand?.priority ?? "MEDIUM",
    status: demand?.status ?? "OPEN",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open={open} onClose={onClose} title={demand ? "Editar demanda" : "Nova demanda"} wide>
      <form
        className="grid gap-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveDemand(demand?.id ?? null, { ...f, sectorId: demand?.sectorId ?? sectorId, dueDate: f.dueDate || null }), "Demanda salva", onClose, { kind: "demand", files });
        }}
      >
        <Field label="Demanda" htmlFor="d-title">
          <input id="d-title" className={inputCls} value={f.title} onChange={set("title")} required />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Origem" htmlFor="d-src">
            <input id="d-src" className={inputCls} value={f.source} onChange={set("source")} placeholder="Cliente, Diretoria, Interna…" list="d-src-list" />
            <datalist id="d-src-list">
              <option value="Cliente" />
              <option value="Diretoria" />
              <option value="Interna" />
              <option value="Produção" />
              <option value="Auditoria" />
            </datalist>
          </Field>
          <Field label="Prioridade" htmlFor="d-prio">
            <select id="d-prio" className={inputCls} value={f.priority} onChange={set("priority")}>
              {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data de entrada" htmlFor="d-rec">
            <input id="d-rec" type="date" className={inputCls} value={f.receivedAt} onChange={set("receivedAt")} />
          </Field>
          <Field label="Prazo" htmlFor="d-due">
            <input id="d-due" type="date" className={inputCls} value={f.dueDate} onChange={set("dueDate")} />
          </Field>
          <Field label="Status" htmlFor="d-status">
            <select id="d-status" className={inputCls} value={f.status} onChange={set("status")}>
              {Object.entries(DEMAND_STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Detalhes" htmlFor="d-det">
          <textarea id="d-det" rows={3} className={cn(inputCls, "h-auto py-3")} value={f.details} onChange={set("details")} />
        </Field>
        <FormFiles existing={existing} files={files} setFiles={setFiles} disabled={pending} />
        <Button type="submit" block disabled={pending}>
          {pending ? "Salvando…" : "Salvar demanda"}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Nota ----------
export function NoteForm({ note, sectorId, files: existing = [], open, onClose }: { note?: { id: string; content: string }; sectorId: string; files?: AttachmentDTO[]; open: boolean; onClose: () => void }) {
  const { pending, run } = useSave();
  const [files, setFiles] = useState<File[]>([]);
  const [content, setContent] = useState(note?.content ?? "");
  return (
    <Sheet open={open} onClose={onClose} title={note ? "Editar nota" : "Nova nota"} wide>
      <form
        className="grid gap-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveNote(note?.id ?? null, sectorId, content), "Nota salva", onClose, { kind: "note", files });
        }}
      >
        <label htmlFor="note-c" className="sr-only">
          Nota
        </label>
        <textarea id="note-c" rows={6} data-autofocus className={cn(inputCls, "h-auto py-3 leading-relaxed")} value={content} onChange={(e) => setContent(e.target.value)} required />
        <FormFiles existing={existing} files={files} setFiles={setFiles} disabled={pending} />
        <Button type="submit" block disabled={pending}>
          {pending ? "Salvando…" : "Salvar nota"}
        </Button>
      </form>
    </Sheet>
  );
}
