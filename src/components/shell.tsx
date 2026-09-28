"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  Calendar,
  Inbox,
  LayoutGrid,
  ListChecks,
  Plus,
  Search,
  Settings,
  Sun,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/app-provider";
import { FlangeMark } from "@/components/brand";
import { SectorTile, Dot, type Health } from "@/components/ds";
import { useOfflineQueueFlush } from "@/components/capture-sheet";

const NAV = [
  { href: "/hoje", label: "Hoje", icon: Sun },
  { href: "/caixa", label: "Caixa de entrada", icon: Inbox, count: "inbox" as const },
  { href: "/acoes", label: "Ações", icon: ListChecks, count: "overdue" as const },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/setores", label: "Setores", icon: LayoutGrid },
  { href: "/revisao", label: "Revisão semanal", icon: CalendarCheck },
  { href: "/relatorios", label: "Relatórios", icon: TrendingUp },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function Sidebar({ health }: { health: Record<string, Health> }) {
  const path = usePathname();
  const { inboxCount, overdueCount, sectors, userName, setSearchOpen, openCapture } = useApp();
  const top = sectors.filter((s) => !s.parentId && s.active);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-line bg-side px-2.5 pt-3.5 md:flex">
      <Link href="/hoje" className="flex items-center gap-2.5 px-2 pb-3.5">
        <FlangeMark size={30} />
        <span>
          <b className="block text-[15px] leading-tight">HRM Gestão</b>
          <small className="block text-[12px] text-fg-3">Caldeiraria Industrial</small>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="mx-0.5 mb-2 flex h-[34px] items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5 text-[13px] text-fg-3 hover:border-line-strong"
      >
        <Search className="size-[15px]" /> Buscar
        <kbd className="ml-auto rounded border border-line bg-surface-2 px-1.5 font-mono text-[11px]">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => openCapture()}
        className="mx-0.5 mb-3 flex h-[34px] items-center gap-2 rounded-[8px] bg-ac px-2.5 text-[13px] font-semibold text-ac-fg hover:bg-ac-hover"
      >
        <Plus className="size-4" /> Capturar
        <kbd className="ml-auto rounded border border-current/40 px-1.5 font-mono text-[11px] opacity-80">C</kbd>
      </button>
      <nav className="grid gap-0.5" aria-label="Principal">
        {NAV.map((n) => {
          const on = isActive(path, n.href);
          const c = n.count === "inbox" ? inboxCount : n.count === "overdue" ? overdueCount : null;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-[34px] items-center gap-2.5 rounded-[8px] px-2.5 text-[14px] font-medium text-fg-2 hover:bg-surface-2",
                on && "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--line),var(--shadow-sm)] [&>svg]:text-ac-text",
              )}
            >
              <n.icon className="size-[17px]" />
              {n.label}
              {!!c && (
                <span className={cn("ml-auto font-mono text-[12px]", n.count === "overdue" ? "font-semibold text-red" : "text-fg-3")}>{c}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-2.5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.07em] text-fg-3">Setores</div>
      <div className="-mx-1 grid min-h-0 flex-1 content-start gap-px overflow-y-auto px-1 pb-2">
        {top.map((s) => {
          const on = path === `/setores/${s.slug}`;
          return (
            <Link
              key={s.id}
              href={`/setores/${s.slug}`}
              className={cn("flex h-[30px] items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] text-fg-2 hover:bg-surface-2", on && "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--line)]")}
            >
              <SectorTile sector={s} size={20} />
              <span className="truncate">{s.shortName || s.name}</span>
              {health[s.id] && <Dot status={health[s.id]} className="ml-auto size-2" />}
            </Link>
          );
        })}
      </div>
      <Link href="/config" className="flex items-center gap-2.5 border-t border-line px-2 py-3 text-[13px] hover:bg-surface-2">
        <span className="grid size-[30px] place-items-center rounded-full bg-ac-soft text-[12px] font-bold text-ac-text">
          {userName.slice(0, 2).toUpperCase()}
        </span>
        <span>
          <b className="block">{userName}</b>
          <small className="text-fg-3">Gerente Geral</small>
        </span>
        <Settings className="ml-auto size-4 text-fg-3" aria-label="Configurações" />
      </Link>
    </aside>
  );
}

const TABS = [
  { href: "/hoje", label: "Hoje", icon: Sun },
  { href: "/acoes", label: "Ações", icon: ListChecks },
  null,
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/setores", label: "Setores", icon: LayoutGrid },
];

export function TabBar() {
  const path = usePathname();
  const { openCapture } = useApp();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg md:hidden"
    >
      {TABS.map((t) =>
        t === null ? (
          <button key="cap" type="button" onClick={() => openCapture()} className="flex flex-col items-center justify-center gap-[3px] text-[13px] font-semibold text-fg">
            <span className="-mt-6 grid size-[58px] place-items-center rounded-[19px] bg-ac text-ac-fg shadow-[0_10px_22px_-8px_color-mix(in_srgb,var(--ac)_80%,transparent)] transition-transform active:scale-95">
              <Plus className="size-[30px]" />
            </span>
            Capturar
          </button>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive(path, t.href) ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center gap-[3px] text-[13px] font-semibold",
              isActive(path, t.href) ? "text-ac-text" : "text-fg-3",
            )}
          >
            <t.icon className="size-6" />
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const up = () => setOffline(!navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-bg px-4 py-2 pt-[calc(8px+env(safe-area-inset-top))] text-[14px] font-semibold text-amber">
      <WifiOff className="size-4" />
      Sem conexão. Mostrando o que já foi carregado; capturas ficam guardadas.
    </div>
  );
}

/** Atalhos de teclado do desktop, registro do service worker e fila offline. */
export function GlobalEffects() {
  const router = useRouter();
  const { openCapture, setSearchOpen } = useApp();
  useOfflineQueueFlush();

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Atalho do ícone do app: "Capturar"
    if (new URLSearchParams(location.search).get("capturar") === "1") openCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (g) {
        g = false;
        const to = { h: "/hoje", a: "/acoes", s: "/setores", c: "/caixa", g: "/agenda" }[k];
        if (to) router.push(to);
        return;
      }
      if (k === "g") {
        g = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (g = false), 900);
      } else if (k === "c" || k === "n") {
        e.preventDefault();
        openCapture();
      } else if (k === "/") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openCapture, setSearchOpen]);
  return null;
}
