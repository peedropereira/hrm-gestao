"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Ditado por voz usando o reconhecimento de fala do próprio aparelho
// (Google no Android/Chrome, Apple no iPhone/Safari). Sem custo e sem serviço extra.

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone para este site nas configurações do navegador.",
  "service-not-allowed": "O reconhecimento de voz não está disponível neste modo. Use o microfone do teclado.",
  "no-speech": "Não ouvi nada. Toque em Falar e fale perto do celular.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "Sem conexão para reconhecer a voz. Tente o microfone do teclado.",
};

/**
 * `onText` recebe cada trecho reconhecido de forma definitiva.
 * `interim` é o que está sendo reconhecido agora (para mostrar ao vivo).
 */
export function useSpeech(onText: (text: string) => void) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => !!getCtor(),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  }, [onText]);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError("Este navegador não reconhece voz. Use o microfone do teclado do celular.");
      return;
    }
    setError(null);
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(ERRORS[e.error] ?? "Não foi possível ouvir. Tente de novo.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      try {
        navigator.vibrate?.(10);
      } catch {
        /* sem vibração */
      }
    } catch {
      setError("Não foi possível iniciar o microfone.");
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}
