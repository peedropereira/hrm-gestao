"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LayoutGrid, ListChecks, Loader2, Search, StickyNote, User, Wrench, Calendar, Inbox } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { useApp } from "@/components/app-provider";
import { cn } from "@/lib/utils";

export type SearchHit = { type: "action" | "demand" | "need" | "note" | "sector" | "person" | "event" | "inbox"; id: string; title: string; sub: string; href: string };

const ICON = { action: ListChecks, demand: FileText, need: Wrench, note: StickyNote, sector: LayoutGrid, person: User, event: Calendar, inbox: Inbox };
const TYPE_LABEL = { action: "Ação", demand: "Demanda", need: "Necessidade", note: "Nota", sector: "Setor", person: "Pessoa", event: "Evento", inbox: "Caixa" };

export function useSearch(q: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/busca?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d) => setHits(d.hits ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);
  return term.length < 2 ? { hits: [], loading: false } : { hits, loading };
}

export function SearchResults({ hits, active, onPick }: { hits: SearchHit[]; active: number; onPick: (h: SearchHit) => void }) {
  return (
    <ul className="grid gap-0.5" role="listbox">
      {hits.map((h, i) => {
        const I = ICON[h.type];
        return (
          <li key={`${h.type}-${h.id}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              onClick={() => onPick(h)}
              className={cn("flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-surface-2", i === active && "bg-ac-soft")}
            >
              <I className="size-[18px] shrink-0 text-fg-3" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{h.title}</span>
                <span className="block truncate text-[13px] text-fg-3">
                  {TYPE_LABEL[h.type]} · {h.sub}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SearchPalette() {
  const { searchOpen, setSearchOpen } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const { hits, loading } = useSearch(q);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    setSearchOpen(false);
    setQ("");
    setActive(0);
  };

  const pick = (h: SearchHit) => {
    close();
    router.push(h.href);
  };

  return (
    <Sheet open={searchOpen} onClose={close} title="Buscar" wide>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <input
          ref={input}
          data-autofocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[active]) pick(hits[active]);
          }}
          placeholder="Ações, demandas, necessidades, notas, pessoas…  (#tag)"
          aria-label="Buscar"
          className="h-12 w-full rounded-[12px] border border-line-strong bg-bg pl-11 pr-10 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)]"
        />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 animate-spin text-fg-3" />}
      </div>
      {q.trim().length >= 2 && !loading && hits.length === 0 ? (
        <p className="px-2 py-6 text-center text-fg-3">Nada encontrado para “{q.trim()}”.</p>
      ) : q.trim().length < 2 ? (
        <p className="px-2 py-4 text-[14px] text-fg-3">Digite pelo menos 2 letras. Use # para buscar por tag.</p>
      ) : (
        <SearchResults hits={hits} active={active} onPick={pick} />
      )}
    </Sheet>
  );
}
