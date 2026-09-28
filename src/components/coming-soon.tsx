import type { ReactNode } from "react";
import { EmptyState } from "@/components/ds";

export function ComingSoon({ title, phase, children }: { title: string; phase: number; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[760px]">
      <header className="px-5 pb-3 pt-3 md:px-7 md:pt-6">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">{title}</h1>
      </header>
      <div className="px-4 md:px-7">
        <EmptyState title={`Chega na Fase ${phase}`}>{children}</EmptyState>
      </div>
    </div>
  );
}
