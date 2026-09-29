"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileAudio, Loader2, Mic, Pause, Play, RefreshCw, Sparkles, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { Card, PanelHead } from "@/components/ds";
import { ensureOccurrence } from "@/app/actions/events";
import { addRecordingPart, generateMinutes, saveLiveTranscript, transcribePart } from "@/app/actions/recording";
import { uploadFiles } from "@/lib/upload-client";
import { formatDuration } from "@/lib/upload-rules";
import { liveTranscriptSupported, recorderSupported, useLiveTranscript, useRecorder, type RecordedPart } from "@/lib/use-recorder";
import { cn } from "@/lib/utils";

export type RecorderProps = {
  eventId: string;
  virtual: boolean;
  date: string;
  title: string;
  ai: { transcribe: boolean; write: boolean };
  /** Áudios já guardados neste compromisso. */
  parts: { id: string; transcribed: boolean; durationSec: number | null }[];
  transcript: string | null;
  onMinutes: (text: string) => void;
};

type PartState = { index: number; status: "sending" | "saved" | "failed"; durationSec: number; part?: RecordedPart };

function extOf(mime: string) {
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function audioDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 4000);
    a.src = url;
  });
}

function download(part: RecordedPart) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(part.blob);
  a.download = `gravacao-parte-${part.index}.${extOf(part.mimeType)}`;
  a.click();
}

export function MeetingRecorder(p: RecorderProps) {
  const router = useRouter();
  const [parts, setParts] = useState<PartState[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(!p.ai.transcribe);
  const [supported, setSupported] = useState({ rec: true, live: true });
  const chain = useRef<Promise<void>>(Promise.resolve());
  const newIds = useRef<string[]>([]);
  const baseTranscript = useRef(p.transcript ?? "");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // detecta no aparelho (não existe no servidor)
    const t = setTimeout(() => setSupported({ rec: recorderSupported(), live: liveTranscriptSupported() }), 0);
    return () => clearTimeout(t);
  }, []);

  const sendPart = useCallback(
    async (part: RecordedPart) => {
      setParts((ps) => [...ps.filter((x) => x.index !== part.index), { index: part.index, status: "sending", durationSec: part.durationSec, part }]);
      try {
        const now = new Date();
        const hh = `${String(now.getHours()).padStart(2, "0")}h${String(now.getMinutes()).padStart(2, "0")}`;
        const file = new File([part.blob], `Gravação ${p.title.slice(0, 50)} parte ${part.index} (${hh}).${extOf(part.mimeType)}`, { type: part.mimeType || "audio/webm" });
        const [up] = await uploadFiles([file]);
        const r = await addRecordingPart(p.eventId, up, part.durationSec);
        if (!r.ok || !r.data) throw new Error(r.ok ? "Falha ao salvar." : r.error);
        newIds.current.push(r.data.attachmentId);
        setParts((ps) => ps.map((x) => (x.index === part.index ? { ...x, status: "saved", part: undefined } : x)));
      } catch {
        setParts((ps) => ps.map((x) => (x.index === part.index ? { ...x, status: "failed" } : x)));
      }
    },
    [p.eventId, p.title],
  );

  const rec = useRecorder((part) => {
    chain.current = chain.current.then(() => sendPart(part));
  });
  const { elapsedRef } = rec;
  const clock = useCallback(() => elapsedRef.current, [elapsedRef]);
  const tr = useLiveTranscript(clock);
  const recording = rec.status === "recording" || rec.status === "paused";
  const linesRef = useRef<string[]>([]);
  useEffect(() => {
    linesRef.current = tr.lines;
  }, [tr.lines]);
  const fullTranscript = useCallback(() => [baseTranscript.current.trim(), linesRef.current.join("\n")].filter(Boolean).join("\n\n"), []);

  // salva a transcrição ao vivo a cada 30 s
  useEffect(() => {
    if (!recording || !live) return;
    const t = setInterval(() => {
      if (linesRef.current.length) void saveLiveTranscript(p.eventId, fullTranscript());
    }, 30000);
    return () => clearInterval(t);
  }, [recording, live, p.eventId, fullTranscript]);

  // não deixa sair da tela sem querer durante a gravação
  useEffect(() => {
    if (!recording) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording]);

  /** Transcreve o que falta (se houver serviço) e monta a ata. */
  const buildMinutes = async (extraIds: string[] = []) => {
    try {
      if (p.ai.transcribe) {
        const pending = [...p.parts.filter((x) => !x.transcribed).map((x) => x.id), ...newIds.current, ...extraIds].filter((v, i, a) => a.indexOf(v) === i);
        for (const [i, id] of pending.entries()) {
          setBusy(`Transcrevendo o áudio${pending.length > 1 ? ` (parte ${i + 1} de ${pending.length})` : ""}…`);
          const r = await transcribePart(id);
          if (!r.ok) throw new Error(r.error);
        }
      }
      setBusy(p.ai.write ? "Redigindo a ata…" : "Montando a ata…");
      const g = await generateMinutes(p.eventId);
      if (!g.ok || !g.data) throw new Error(g.ok ? "Falha ao gerar a ata." : g.error);
      p.onMinutes(g.data.minutes);
      newIds.current = [];
      toast.success(g.data.usedAI ? "Ata pronta. Revise e gere as ações." : "Transcrição colocada na ata. Revise e gere as ações.");
      document.getElementById("minutes")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível montar a ata.");
    } finally {
      setBusy(null);
    }
  };

  const begin = async () => {
    if (p.virtual) {
      // reunião de uma série: cria o registro desta data antes de gravar
      setBusy("Preparando…");
      const r = await ensureOccurrence(p.eventId, p.date);
      setBusy(null);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Erro." : r.error);
      router.replace(`/agenda/evento/${r.data.id}?gravar=1`);
      toast("Pronto. Toque em “Gravar reunião” para começar.");
      return;
    }
    baseTranscript.current = p.transcript ?? "";
    setParts([]);
    const ok = await rec.start();
    if (ok && live && supported.live) tr.start();
  };

  const finish = async () => {
    tr.stop();
    await rec.stop();
    setBusy("Salvando as últimas partes…");
    await chain.current;
    if (live && linesRef.current.length) await saveLiveTranscript(p.eventId, fullTranscript());
    setBusy(null);
    if (!p.ai.transcribe && !linesRef.current.length && !baseTranscript.current.trim()) {
      toast("Gravação salva. Para virar ata automática é preciso a transcrição ao vivo ou o serviço de transcrição.");
      return;
    }
    await buildMinutes();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (p.virtual) return void toast.error("Toque em “Gravar reunião” uma vez para preparar esta data e depois envie o áudio.");
    setBusy("Enviando o áudio…");
    try {
      const dur = await audioDuration(f);
      const [up] = await uploadFiles([f], (_i, _t, pct) => setBusy(`Enviando o áudio · ${pct}%`));
      const r = await addRecordingPart(p.eventId, up, dur);
      if (!r.ok || !r.data) throw new Error(r.ok ? "Falha ao salvar." : r.error);
      setBusy(null);
      if (p.ai.transcribe) await buildMinutes([r.data.attachmentId]);
      else toast.success("Áudio guardado na reunião. Para virar ata, é preciso ligar a transcrição automática.");
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o áudio.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const savedCount = parts.filter((x) => x.status === "saved").length;
  const failedParts = parts.filter((x) => x.status === "failed");
  const canBuild = !recording && !busy && (p.parts.length > 0 || !!p.transcript?.trim());
  const bars = 14;

  return (
    <Card>
      <PanelHead title="Gravação da reunião">
        {recording && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-red">
            <span className={cn("size-2 rounded-full bg-red-solid", rec.status === "recording" && "animate-pulse")} /> {rec.status === "paused" ? "pausada" : "gravando"}
          </span>
        )}
      </PanelHead>
      <div className="grid gap-3 p-4">
        {!recording && rec.status !== "stopping" && (
          <>
            <p className="text-[15px] text-fg-2 md:text-[14px]">Grave a reunião pelo celular: no fim, o sistema transcreve e monta a ata com resumo, decisões e ações.</p>
            {!supported.rec && <p className="text-[14px] text-amber">Este navegador não grava áudio. Use o Chrome no Android ou o Safari no iPhone.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              <Button onClick={() => void begin()} disabled={!!busy || !supported.rec || rec.status === "starting"}>
                {busy === "Preparando…" || rec.status === "starting" ? <Loader2 className="animate-spin" /> : <Mic />} Gravar reunião
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}>
                <Upload /> Enviar áudio já gravado
              </Button>
              <input ref={fileInput} type="file" accept="audio/*,.m4a,.mp3,.ogg,.opus,.wav,.aac" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </div>
            {supported.live && (
              <label className="flex items-start gap-2.5 text-[14px] text-fg-2">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--ac)]" checked={live} onChange={(e) => setLive(e.target.checked)} />
                <span>
                  Transcrever ao vivo pelo próprio celular (grátis)
                  <span className="block text-[13px] text-fg-3">
                    {p.ai.transcribe ? "Opcional: o áudio já é transcrito no fim, com mais qualidade." : "Precisa de internet. Em alguns Androids não funciona junto com a gravação."}
                  </span>
                </span>
              </label>
            )}
            <p className="flex items-start gap-2 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" /> Avise os participantes de que a reunião será gravada. Deixe o celular no meio da mesa, com a tela ligada.
            </p>
            {canBuild && (
              <Button variant="secondary" onClick={() => void buildMinutes()}>
                <Sparkles /> Gerar ata da gravação
              </Button>
            )}
          </>
        )}

        {(recording || rec.status === "stopping") && (
          <div className="grid gap-3">
            <div className="flex items-center gap-4">
              <span className="font-mono text-[40px] font-bold leading-none tracking-tight tabular-nums md:text-[34px]">{formatDuration(rec.elapsed)}</span>
              <div className="flex h-10 flex-1 items-center gap-[3px]" aria-hidden="true">
                {Array.from({ length: bars }, (_, i) => (
                  <span
                    key={i}
                    className={cn("w-full rounded-full transition-colors duration-100", rec.status === "recording" && rec.level * bars > i ? "bg-ac" : "bg-line")}
                    style={{ height: `${30 + (i % 4) * 15}%` }}
                  />
                ))}
              </div>
            </div>
            <p className="text-[14px] text-fg-3">
              {savedCount > 0 ? `${savedCount} ${savedCount === 1 ? "parte salva" : "partes salvas"} · ` : ""}
              Salva sozinho a cada 5 minutos. Mantenha esta tela aberta.
            </p>
            {live && (tr.lines.length > 0 || tr.interim) && (
              <div className="max-h-[132px] overflow-y-auto rounded-[10px] bg-surface-2 px-3 py-2 text-[14px] leading-relaxed text-fg-2">
                {tr.lines.slice(-4).map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
                {tr.interim && <p className="text-fg-3">{tr.interim}…</p>}
              </div>
            )}
            {tr.failed && <p className="text-[13px] text-amber">{tr.failed}</p>}
            <div className="grid grid-cols-2 gap-2">
              {rec.status === "paused" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    rec.resume();
                    if (live) tr.start();
                  }}
                >
                  <Play /> Continuar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={rec.status === "stopping"}
                  onClick={() => {
                    rec.pause();
                    tr.stop();
                  }}
                >
                  <Pause /> Pausar
                </Button>
              )}
              <Button variant="danger" disabled={rec.status === "stopping"} onClick={() => void finish()}>
                {rec.status === "stopping" ? <Loader2 className="animate-spin" /> : <Square className="fill-current" />} Encerrar
              </Button>
            </div>
          </div>
        )}

        {rec.error && <p className="text-[14px] text-amber">{rec.error}</p>}

        {busy && busy !== "Preparando…" && (
          <p className="flex items-center gap-2 text-[15px] font-medium text-ac-text md:text-[14px]" role="status">
            <Loader2 className="size-4 animate-spin" /> {busy}
          </p>
        )}

        {failedParts.length > 0 && (
          <ul className="grid gap-1.5">
            {failedParts.map((x) => (
              <li key={x.index} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-red-bg px-3 py-2 text-[14px]">
                <FileAudio className="size-4 text-red" /> Parte {x.index} ({formatDuration(x.durationSec)}) não foi enviada
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => x.part && void sendPart(x.part)}>
                    <RefreshCw /> Enviar de novo
                  </Button>
                  {x.part && (
                    <Button size="sm" variant="secondary" onClick={() => download(x.part!)}>
                      <Download /> Baixar
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!recording && savedCount > 0 && !busy && failedParts.length === 0 && (
          <p className="flex items-center gap-2 text-[14px] text-green">
            <CheckCircle2 className="size-4" /> Gravação salva em “Fotos e documentos” desta reunião.
          </p>
        )}
      </div>
    </Card>
  );
}
