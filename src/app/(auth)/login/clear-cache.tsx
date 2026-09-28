"use client";

import { useEffect } from "react";

/** Ao sair, apaga as telas guardadas para uso sem sinal neste aparelho. */
export function ClearOfflineCache() {
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage("limpar-cache");
    try {
      localStorage.removeItem("hrm-captura-offline");
    } catch {
      /* sem armazenamento */
    }
  }, []);
  return null;
}
