"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { completeAction, deleteAction, reopenAction, restoreAction, setDueDate, snoozeAction } from "@/app/actions/actions";
import { formatShort } from "@/lib/dates";
import type { ActionDTO, AppContextData, PersonDTO, SectorDTO } from "@/lib/types";

type Patch = Partial<Pick<ActionDTO, "status" | "dueDate">> & { hidden?: boolean };

type Ctx = AppContextData & {
  sectorById: (id: string | null | undefined) => SectorDTO | undefined;
  personById: (id: string | null | undefined) => PersonDTO | undefined;
  captureOpen: boolean;
  openCapture: (text?: string, opts?: { voice?: boolean }) => void;
  /** Abriu a captura para falar: o microfone começa a ouvir sozinho. */
  captureVoice: boolean;
  closeCapture: () => void;
  captureSeed: string;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  /** Aplica as mudanças otimistas (a tela responde antes do servidor). */
  applyOverlay: (list: ActionDTO[]) => ActionDTO[];
  patchOf: (id: string) => Patch | undefined;
  complete: (a: ActionDTO) => void;
  reopen: (a: ActionDTO) => void;
  snooze: (a: ActionDTO, dueDate: string) => void;
  remove: (a: ActionDTO) => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}

function vibrate() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* sem suporte */
  }
}

export function AppProvider({ data, children }: { data: AppContextData; children: ReactNode }) {
  const [overlay, setOverlay] = useState<Record<string, Patch>>({});
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSeed, setCaptureSeed] = useState("");
  const [captureVoice, setCaptureVoice] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const sectorMap = useMemo(() => new Map(data.sectors.map((s) => [s.id, s])), [data.sectors]);
  const personMap = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);

  const setPatch = useCallback((id: string, p: Patch | null) => {
    setOverlay((o) => {
      const n = { ...o };
      if (p) n[id] = { ...o[id], ...p };
      else delete n[id];
      return n;
    });
  }, []);

  const run = useCallback(
    async (id: string, patch: Patch, fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setPatch(id, patch);
      const r = await fn();
      setPatch(id, null);
      if (!r.ok) toast.error(r.error ?? "Não foi possível salvar.");
      return r.ok;
    },
    [setPatch],
  );

  const reopen = useCallback(
    (a: ActionDTO) => {
      void run(a.id, { status: "TODO" }, () => reopenAction(a.id, a.status === "DONE" ? "TODO" : a.status));
    },
    [run],
  );

  const complete = useCallback(
    (a: ActionDTO) => {
      vibrate();
      const prev = a.status;
      // O aviso aparece na hora; "Desfazer" espera o salvamento terminar antes de reverter.
      const saved = run(a.id, { status: "DONE" }, () => completeAction(a.id));
      toast.success("Ação concluída", {
        action: {
          label: "Desfazer",
          onClick: () => void saved.then((ok) => ok && run(a.id, { status: prev }, () => reopenAction(a.id, prev))),
        },
      });
    },
    [run],
  );

  const snooze = useCallback(
    (a: ActionDTO, dueDate: string) => {
      const prev = a.dueDate;
      const saved = run(a.id, { dueDate }, () => snoozeAction(a.id, dueDate));
      toast.success(`Adiada para ${formatShort(dueDate)}`, {
        action: {
          label: "Desfazer",
          onClick: () => void saved.then((ok) => ok && run(a.id, { dueDate: prev }, () => setDueDate(a.id, prev))),
        },
      });
    },
    [run],
  );

  const remove = useCallback(
    (a: ActionDTO) => {
      const saved = run(a.id, { hidden: true }, () => deleteAction(a.id));
      toast.success("Ação excluída", {
        action: { label: "Desfazer", onClick: () => void saved.then((ok) => ok && run(a.id, {}, () => restoreAction(a.id))) },
      });
    },
    [run],
  );

  const applyOverlay = useCallback(
    (list: ActionDTO[]) =>
      list
        .filter((a) => !overlay[a.id]?.hidden)
        .map((a) => {
          const p = overlay[a.id];
          if (!p) return a;
          return { ...a, ...(p.status !== undefined && { status: p.status }), ...(p.dueDate !== undefined && { dueDate: p.dueDate }) };
        }),
    [overlay],
  );

  const value: Ctx = {
    ...data,
    sectorById: (id) => (id ? sectorMap.get(id) : undefined),
    personById: (id) => (id ? personMap.get(id) : undefined),
    captureOpen,
    captureSeed,
    captureVoice,
    openCapture: (text = "", opts) => {
      setCaptureSeed(text);
      setCaptureVoice(!!opts?.voice);
      setCaptureOpen(true);
    },
    closeCapture: () => setCaptureOpen(false),
    searchOpen,
    setSearchOpen,
    applyOverlay,
    patchOf: (id) => overlay[id],
    complete,
    reopen,
    snooze,
    remove,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
