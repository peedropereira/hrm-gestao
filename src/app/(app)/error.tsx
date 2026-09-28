"use client";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/ds";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[560px] px-4 pt-10">
      <EmptyState title="Não foi possível carregar esta tela">
        Pode ser o sinal fraco. Seus dados estão salvos.
        <div className="mt-4">
          <Button onClick={reset}>Tentar de novo</Button>
        </div>
      </EmptyState>
    </div>
  );
}
