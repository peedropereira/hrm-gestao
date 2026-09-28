"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Folha inferior no celular (arrastar para baixo fecha) e diálogo centralizado no desktop.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button:not([data-close])");
      el?.focus({ preventScroll: true });
    }, 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:items-center md:justify-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-[rgba(8,10,12,0.5)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[26px] border-t border-line bg-surface px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2.5 shadow-float",
              "md:max-h-[85dvh] md:rounded-[16px] md:border md:px-5 md:pb-5 md:pt-4",
              wide ? "md:max-w-[640px]" : "md:max-w-[480px]",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="-mx-4 -mt-2.5 flex touch-none justify-center pb-3 pt-2.5 md:hidden"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="h-[5px] w-10 rounded-full bg-line-strong" />
            </div>
            <div className="mb-3 flex items-start justify-between gap-3 px-1.5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[20px] font-bold tracking-[-0.015em] md:text-[18px]">
                  {title}
                </h2>
                {description && <div className="mt-0.5 text-[15px] text-fg-3 md:text-[14px]">{description}</div>}
              </div>
              <button
                type="button"
                data-close
                onClick={onClose}
                className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface-2"
                aria-label="Fechar"
              >
                <X className="size-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function SheetOption({
  icon,
  label,
  hint,
  onClick,
  tone,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[58px] w-full items-center gap-3.5 rounded-[12px] px-3 text-left text-[17px] font-medium hover:bg-surface-2 md:min-h-12 md:text-[15px] [&_svg]:size-5 [&_svg]:shrink-0",
        tone === "danger" ? "text-red" : "text-fg",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="font-mono text-[15px] text-fg-3 md:text-[13px]">{hint}</span>}
    </button>
  );
}
