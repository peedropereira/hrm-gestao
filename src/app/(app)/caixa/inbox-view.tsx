"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, ListChecks, Plus, StickyNote, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { ParsedChips } from "@/components/capture-sheet";
import { EmptyState, SectorTile } from "@/components/ds";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { discardInbox, triageToAction, triageToDemand, triageToNeed, triageToNote, undoTriage } from "@/app/actions/inbox";
import { parseNL } from "@/lib/nl-parse";
import { formatDateTimeShort } from "@/lib/dates";
import { NEED_CATEGORY_LABEL } from "@/lib/labels";

type Item = { id: string; text: string; createdAt: string };
type Target = { item: Item; kind: "demand" | "need" | "note" } | null;

export function InboxView({ items }: { items: Item[] }) {
  const { today, people, sectors, openCapture } = useApp();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<Target>(null);
  const [category, setCategory] = useState("EQUIPMENT");

  const visible = items.filter((i) => !gone.has(i.id));

  const act = async (item: Item, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setGone((g) => new Set(g).add(item.id));
    const r = await fn();
    if (!r.ok) {
      setGone((g) => {
        const n = new Set(g);
        n.delete(item.id);
        return n;
      });
      return void toast.error(r.error);
    }
    toast.success(msg, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const u = await undoTriage(item.id);
          if (u.ok)
            setGone((g) => {
              const n = new Set(g);
              n.delete(item.id);
              return n;
            });
        },
      },
    });
  };

  const topSectors = sectors.filter((s) => s.active);

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="flex items-end justify-between gap-3 px-5 pb-3 pt-3 md:px-7 md:pt-6">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Caixa de entrada</h1>
          <p className="text-[15px] font-medium text-fg-3 md:text-[14px]">
            {visible.length} {visible.length === 1 ? "item para triar" : "itens para triar"} · um toque decide o destino
          </p>
        </div>
        <Button size="sm" className="hidden md:inline-flex" onClick={() => openCapture()}>
          <Plus /> Capturar
        </Button>
      </header>

      {visible.length === 0 ? (
        <EmptyState title="Caixa de entrada vazia 👏" className="mx-4 md:mx-7">
          Toque em + para capturar algo novo.
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5 px-4 md:px-7">
          <AnimatePresence initial={false}>
            {visible.map((item) => {
              const r = parseNL(item.text, { today, people, sectors });
              return (
                <motion.li
                  key={item.id}
                  layout
                  exit={{ opacity: 0, x: 40, transition: { duration: 0.22 } }}
                  className="rounded-[14px] border border-line bg-surface p-3.5 shadow-card md:rounded-[12px]"
                >
                  <p className="text-[17px] font-medium leading-snug md:text-[15px]">{item.text}</p>
                  <p className="mt-1 font-mono text-[12px] text-fg-3">capturado {formatDateTimeShort(new Date(item.createdAt))}</p>
                  <details className="mt-2 text-[14px] text-fg-3">
                    <summary className="cursor-pointer py-1">Como vira ação</summary>
                    <div className="pt-2">
                      <ParsedChips r={r} />
                    </div>
                  </details>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Button size="sm" className="col-span-2 h-11 sm:col-span-1 md:h-9" onClick={() => act(item, () => triageToAction(item.id), "Virou ação")}>
                      <ListChecks /> Ação
                    </Button>
                    <Button size="sm" variant="secondary" className="h-11 md:h-9" onClick={() => setTarget({ item, kind: "demand" })}>
                      <FileText /> Demanda
                    </Button>
                    <Button size="sm" variant="secondary" className="h-11 md:h-9" onClick={() => setTarget({ item, kind: "need" })}>
                      <Wrench /> Necessidade
                    </Button>
                    <Button size="sm" variant="secondary" className="h-11 md:h-9" onClick={() => setTarget({ item, kind: "note" })}>
                      <StickyNote /> Nota
                    </Button>
                    <Button size="sm" variant="quiet" className="h-11 md:h-9" onClick={() => act(item, () => discardInbox(item.id), "Descartado")}>
                      <Trash2 /> Descartar
                    </Button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <Sheet
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.kind === "demand" ? "Registrar demanda em qual setor?" : target?.kind === "need" ? "Necessidade de qual setor?" : "Nota em qual setor?"}
        description={target?.item.text}
      >
        {target?.kind === "need" && (
          <div className="mb-3 flex flex-wrap gap-2 px-1.5" role="radiogroup" aria-label="Categoria">
            {Object.entries(NEED_CATEGORY_LABEL).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={category === k}
                onClick={() => setCategory(k)}
                className={`h-10 rounded-full border px-3.5 text-[14px] font-semibold ${category === k ? "border-fg bg-fg text-bg" : "border-line text-fg-2"}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="grid max-h-[55dvh] grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2">
          {target?.kind === "note" && (
            <button
              type="button"
              className="flex min-h-[52px] items-center gap-3 rounded-[12px] px-3 text-left text-[16px] font-medium hover:bg-surface-2"
              onClick={() => {
                const t = target;
                setTarget(null);
                void act(t.item, () => triageToNote(t.item.id, null), "Virou nota");
              }}
            >
              <StickyNote className="size-5 text-fg-3" /> Nota geral (sem setor)
            </button>
          )}
          {topSectors.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex min-h-[52px] items-center gap-3 rounded-[12px] px-3 text-left text-[16px] font-medium hover:bg-surface-2"
              onClick={() => {
                const t = target!;
                setTarget(null);
                if (t.kind === "demand") void act(t.item, () => triageToDemand(t.item.id, s.id), `Demanda registrada em ${s.shortName || s.name}`);
                else if (t.kind === "need") void act(t.item, () => triageToNeed(t.item.id, s.id, category), `Necessidade registrada em ${s.shortName || s.name}`);
                else void act(t.item, () => triageToNote(t.item.id, s.id), `Nota salva em ${s.shortName || s.name}`);
              }}
            >
              <SectorTile sector={s} size={30} />
              {s.parentId ? <span className="text-fg-2">{s.name}</span> : s.name}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
