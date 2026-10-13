"use client";

// Fila de capturas feitas sem sinal (fica fora da janela de captura, que só carrega quando é aberta).
import { useEffect } from "react";
import { toast } from "sonner";
import { captureToInbox } from "@/app/actions/inbox";

const QUEUE_KEY = "hrm-captura-offline";

type Queued = { text: string; mode: "action" | "inbox"; at: number };

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* armazenamento indisponível */
  }
}

export function enqueue(text: string) {
  writeQueue([...readQueue(), { text, mode: "inbox", at: Date.now() }]);
}

/** Envia capturas feitas sem sinal quando a conexão volta (sempre para a caixa de entrada). */
export function useOfflineQueueFlush() {
  useEffect(() => {
    const flush = async () => {
      const q = readQueue();
      if (!q.length || !navigator.onLine) return;
      const rest: Queued[] = [];
      for (const item of q) {
        const r = await captureToInbox(item.text).catch(() => ({ ok: false as const, error: "" }));
        if (!r.ok) rest.push(item);
      }
      writeQueue(rest);
      const sent = q.length - rest.length;
      if (sent) toast.success(`${sent} ${sent === 1 ? "captura feita sem sinal foi enviada" : "capturas feitas sem sinal foram enviadas"} para a Caixa de Entrada`);
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
}
