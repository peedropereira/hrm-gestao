"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Gravador de reuniões no navegador.
// - Grava em partes (5 min cada): cada parte é um arquivo completo, enviado assim que termina.
//   Se algo der errado no meio, o que já foi gravado está salvo.
// - Mantém a tela acesa enquanto grava (senão o celular para o microfone ao bloquear).

export type RecordedPart = { blob: Blob; index: number; durationSec: number; mimeType: string };
export type RecorderStatus = "idle" | "starting" | "recording" | "paused" | "stopping";

const MIME_CHOICES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CHOICES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

type WakeLock = { release: () => Promise<void> };

export function recorderSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export function useRecorder(onPart: (p: RecordedPart) => void, segmentSec = 300) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const partIndex = useRef(0);
  const partSec = useRef(0);
  const elapsedRef = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<WakeLock | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const statusRef = useRef<RecorderStatus>("idle");
  const partCb = useRef(onPart);
  const finishing = useRef<(() => void) | null>(null);
  const mime = useRef("");

  useEffect(() => {
    partCb.current = onPart;
  }, [onPart]);

  const setS = (s: RecorderStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const lockScreen = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
      wake.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      /* sem suporte: a tela pode apagar */
    }
  };

  /** Começa uma nova parte no mesmo microfone. */
  const newSegment = useCallback(function openSegment() {
    if (!stream.current) return;
    const r = mime.current ? new MediaRecorder(stream.current, { mimeType: mime.current, audioBitsPerSecond: 32000 }) : new MediaRecorder(stream.current);
    chunks.current = [];
    partSec.current = 0;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: r.mimeType || mime.current || "audio/webm" });
      const dur = partSec.current;
      if (blob.size > 0 && dur > 0) partCb.current({ blob, index: ++partIndex.current, durationSec: dur, mimeType: blob.type });
      if (statusRef.current === "recording" || statusRef.current === "paused") openSegment();
      else finishing.current?.();
    };
    r.start(10000);
    rec.current = r;
  }, []);

  const cleanup = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    void wake.current?.release().catch(() => {});
    wake.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    if (!recorderSupported()) {
      setError("Este navegador não grava áudio. Use o Chrome no Android ou o Safari atualizado no iPhone.");
      return false;
    }
    setError(null);
    setS("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      setS("idle");
      const name = (e as { name?: string }).name;
      setError(name === "NotAllowedError" ? "Permita o uso do microfone para este site e tente de novo." : "Não foi possível usar o microfone.");
      return false;
    }
    mime.current = pickMime() ?? "";
    partIndex.current = 0;
    elapsedRef.current = 0;
    setElapsed(0);

    // medidor de volume (mostra que está captando)
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream.current).connect(an);
      audioCtx.current = ctx;
      const buf = new Uint8Array(an.fftSize);
      let last = 0;
      const loop = (t: number) => {
        if (t - last > 120) {
          last = t;
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
        }
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    } catch {
      /* sem medidor */
    }

    await lockScreen();
    setS("recording");
    newSegment();
    tick.current = setInterval(() => {
      if (statusRef.current !== "recording") return;
      elapsedRef.current += 1;
      partSec.current += 1;
      setElapsed(elapsedRef.current);
      if (partSec.current >= segmentSec && rec.current?.state === "recording") rec.current.stop(); // fecha a parte; onstop abre a próxima
    }, 1000);
    return true;
  }, [newSegment, segmentSec]);

  const pause = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.pause();
    setS("paused");
  }, []);

  const resume = useCallback(() => {
    if (rec.current?.state === "paused") rec.current.resume();
    setS("recording");
  }, []);

  /** Encerra; resolve depois que a última parte foi entregue. */
  const stop = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!rec.current || rec.current.state === "inactive") {
          cleanup();
          setS("idle");
          return resolve();
        }
        setS("stopping");
        finishing.current = () => {
          finishing.current = null;
          cleanup();
          setS("idle");
          resolve();
        };
        rec.current.stop();
      }),
    [cleanup],
  );

  // tela apagou e voltou: pede de novo para manter acesa
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && (statusRef.current === "recording" || statusRef.current === "paused")) void lockScreen();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(
    () => () => {
      statusRef.current = "idle";
      try {
        rec.current?.stop();
      } catch {
        /* já parado */
      }
      cleanup();
    },
    [cleanup],
  );

  return { status, elapsed, level, error, start, pause, resume, stop, elapsedRef };
}

// ---------- Transcrição ao vivo (reconhecimento de voz do aparelho) ----------

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

function speechCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function liveTranscriptSupported() {
  return !!speechCtor();
}

const stamp = (sec: number) => {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m % 60)}:${p(sec % 60)}` : `${p(m)}:${p(sec % 60)}`;
};

/**
 * Transcreve enquanto grava. Reinicia a cada frase (mais estável no celular).
 * `clock` devolve os segundos de gravação, para marcar o tempo de cada trecho.
 */
export function useLiveTranscript(clock: () => number) {
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const active = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const retries = useRef(0);
  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const run = useCallback(function runOnce() {
    const Ctor = speechCtor();
    if (!Ctor || !active.current) return;
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript.trim();
        if (res.isFinal) {
          if (t) {
            retries.current = 0;
            setLines((l) => [...l, `[${stamp(clockRef.current())}] ${t.charAt(0).toUpperCase()}${t.slice(1)}`]);
          }
        } else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        active.current = false;
        setFailed("A transcrição ao vivo não funciona junto com a gravação neste aparelho. O áudio continua sendo gravado normalmente.");
      } else if (e.error === "network") {
        retries.current++;
        if (retries.current > 5) {
          active.current = false;
          setFailed("Sem internet para a transcrição ao vivo. O áudio continua sendo gravado.");
        }
      }
    };
    r.onend = () => {
      setInterim("");
      if (active.current) setTimeout(runOnce, retries.current ? 800 : 60);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      /* já rodando */
    }
  }, []);

  const start = useCallback(() => {
    if (!speechCtor()) return;
    setFailed(null);
    active.current = true;
    retries.current = 0;
    run();
  }, [run]);

  const stop = useCallback(() => {
    active.current = false;
    rec.current?.stop();
    setInterim("");
  }, []);

  useEffect(
    () => () => {
      active.current = false;
      rec.current?.abort();
    },
    [],
  );

  return { lines, interim, failed, start, stop };
}
