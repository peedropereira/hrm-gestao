"use client";

import { useApp } from "@/components/app-provider";
import { ActionDetail } from "../action-detail";
import type { ActionDTO } from "@/lib/types";
import type { ActionExtra } from "@/lib/types";

export function DetailClient({ action, extra }: { action: ActionDTO; extra: ActionExtra }) {
  const { applyOverlay } = useApp();
  const [a] = applyOverlay([action]);
  if (!a) return <p className="px-5 py-10 text-center text-fg-3">Ação excluída.</p>;
  return <ActionDetail key={a.id} action={a} initialExtra={extra} />;
}
