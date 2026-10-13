"use client";

// Captura e busca só baixam o código quando o navegador fica livre (ou ao abrir), deixando a 1ª carga leve.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/components/app-provider";

const loadCapture = () => import("@/components/capture-sheet");
const loadSearch = () => import("@/components/search-palette");
const CaptureSheet = dynamic(() => loadCapture().then((m) => m.CaptureSheet), { ssr: false });
const SearchPalette = dynamic(() => loadSearch().then((m) => m.SearchPalette), { ssr: false });

export function LazySheets() {
  const { captureOpen, searchOpen } = useApp();
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const ready = () => {
      void loadCapture();
      void loadSearch();
      setIdle(true);
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(ready, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(ready, 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      {(idle || captureOpen) && <CaptureSheet />}
      {(idle || searchOpen) && <SearchPalette />}
    </>
  );
}
