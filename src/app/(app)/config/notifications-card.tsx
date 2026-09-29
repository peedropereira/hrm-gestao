"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Bell, BellOff, CalendarPlus, Check, Copy, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { removePushSubscription, resetCalendarToken, savePushSubscription, sendTestPush, updateReminderSettings } from "@/app/actions/notifications";
import { REMINDER_CHOICES } from "@/lib/reminder-options";
import { Field, inputCls } from "../setores/sector-forms";
import { cn } from "@/lib/utils";

export type NotificationProps = {
  vapidKey: string | null;
  devices: number;
  reminderMinutes: number;
  morningDigest: boolean;
  calendarToken: string | null;
  cronUrl: string | null;
};

type Support = "checking" | "ok" | "ios-browser" | "unsupported";

function toKey(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Computador Windows";
  if (/Mac/.test(ua)) return "Mac";
  return "Navegador";
}

function detect(): Support {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-browser";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function NotificationsCard(p: NotificationProps) {
  const support = useSyncExternalStore<Support>(
    () => () => {},
    detect,
    () => "checking",
  );
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [lead, setLead] = useState(p.reminderMinutes);
  const [digest, setDigest] = useState(p.morningDigest);
  const [token, setToken] = useState(p.calendarToken);

  useEffect(() => {
    if (support !== "ok") return;
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setEnabled(!!sub && Notification.permission === "granted");
    });
  }, [support]);

  const enable = async () => {
    if (!p.vapidKey) return void toast.error("Os avisos ainda não foram configurados no servidor.");
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Permissão negada. Libere as notificações deste site nas configurações do celular e tente de novo.");
        return;
      }
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(p.vapidKey) }));
      const r = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, deviceName());
      if (!r.ok) return void toast.error(r.error);
      setEnabled(true);
      const t = await sendTestPush();
      toast.success(t.ok ? "Avisos ativados. Mandei uma notificação de teste." : "Avisos ativados neste aparelho.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível ativar os avisos neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast("Avisos desativados neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  const saveRules = (next: { reminderMinutes: number; morningDigest: boolean }) => {
    setLead(next.reminderMinutes);
    setDigest(next.morningDigest);
    start(async () => {
      const r = await updateReminderSettings(next);
      if (r.ok) toast.success("Avisos salvos");
      else toast.error(r.error);
    });
  };

  const origin = typeof window === "undefined" ? "" : location.origin;
  const feedUrl = token ? `${origin}/api/agenda/feed/${token}.ics` : null;
  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Não foi possível copiar. Segure o texto e copie manualmente.");
    }
  };

  return (
    <div className="grid gap-5">
      {/* 1. Notificações neste aparelho */}
      <div className="grid gap-2.5">
        <div className="flex items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", enabled ? "bg-green-bg text-green" : "bg-surface-2 text-fg-2")}>
            {enabled ? <Bell className="size-5" /> : <BellOff className="size-5" />}
          </span>
          <div className="min-w-0">
            <b className="text-[16px] font-semibold md:text-[15px]">Notificações neste aparelho</b>
            <p className="text-[14px] text-fg-2 md:text-[13px]">
              {support === "checking"
                ? "Verificando…"
                : enabled
                  ? "Ativadas. O celular avisa antes de cada compromisso, mesmo com o app fechado."
                  : "Desativadas neste aparelho."}
              {p.devices > 0 && ` · ${p.devices} ${p.devices === 1 ? "aparelho cadastrado" : "aparelhos cadastrados"}`}
            </p>
          </div>
        </div>
        {support === "ios-browser" && (
          <div className="rounded-[12px] bg-amber-bg p-3 text-[14px] text-fg">
            <b>No iPhone, os avisos só funcionam com o app instalado:</b>
            <ol className="mt-1 list-decimal pl-5 text-fg-2">
              <li>No Safari, toque em Compartilhar (quadrado com seta).</li>
              <li>Escolha “Adicionar à Tela de Início”.</li>
              <li>Abra pelo ícone novo e volte aqui em Configurações.</li>
            </ol>
          </div>
        )}
        {support === "unsupported" && <p className="text-[14px] text-amber">Este navegador não recebe notificações. Use o Chrome no Android ou o app instalado no iPhone.</p>}
        {support === "ok" &&
          (enabled ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy || pending}
                onClick={() =>
                  start(async () => {
                    const r = await sendTestPush();
                    if (r.ok) toast.success("Teste enviado. Deve chegar em alguns segundos.");
                    else toast.error(r.error);
                  })
                }
              >
                <Smartphone /> Enviar teste
              </Button>
              <Button variant="secondary" disabled={busy} onClick={disable}>
                <BellOff /> Desativar
              </Button>
            </div>
          ) : (
            <Button disabled={busy || !p.vapidKey} onClick={enable}>
              {busy ? <Loader2 className="animate-spin" /> : <Bell />} Ativar avisos neste aparelho
            </Button>
          ))}
        {!p.vapidKey && <p className="text-[13px] text-fg-3">Aguardando a configuração das chaves de aviso no servidor.</p>}
      </div>

      {/* 2. Regras */}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Avisar antes dos compromissos" htmlFor="rm-lead" hint="Padrão para compromissos novos. Dá para mudar em cada um.">
          <select id="rm-lead" className={inputCls} value={lead} disabled={pending} onChange={(e) => saveRules({ reminderMinutes: Number(e.target.value), morningDigest: digest })}>
            {REMINDER_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-3 rounded-[12px] border border-line p-3">
          <input type="checkbox" className="mt-1 size-5 accent-[var(--ac)]" checked={digest} disabled={pending} onChange={(e) => saveRules({ reminderMinutes: lead, morningDigest: e.target.checked })} />
          <span>
            <b className="text-[15px] font-semibold md:text-[14px]">Resumo do dia de manhã</b>
            <span className="block text-[14px] text-fg-2 md:text-[13px]">Por volta das 6h30: compromissos, ações para hoje e atrasadas.</span>
          </span>
        </label>
      </div>

      {/* 3. Calendário do celular (alarme nativo) */}
      <div className="grid gap-2.5 border-t border-line pt-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ac-soft text-ac-text">
            <CalendarPlus className="size-5" />
          </span>
          <div className="min-w-0">
            <b className="text-[16px] font-semibold md:text-[15px]">Alarme no calendário do celular</b>
            <p className="text-[14px] text-fg-2 md:text-[13px]">
              Seus compromissos aparecem no calendário do próprio celular, com alarme tocando antes da hora. Atualiza sozinho.
            </p>
          </div>
        </div>
        {feedUrl ? (
          <>
            <div className="grid gap-2 md:grid-cols-2">
              <a
                href={feedUrl.replace(/^https?:/, "webcal:")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-ac px-4 text-[16px] font-semibold text-ac-fg hover:bg-ac-hover md:h-10 md:text-[14px]"
              >
                <CalendarPlus className="size-[18px]" /> Assinar no iPhone
              </a>
              <Button variant="secondary" onClick={() => copy(feedUrl, "Endereço copiado")}>
                <Copy /> Copiar endereço
              </Button>
            </div>
            <details className="text-[14px] text-fg-2">
              <summary className="cursor-pointer font-semibold text-ac-text">Como usar no Android (Google Agenda)</summary>
              <ol className="mt-1.5 list-decimal pl-5">
                <li>Toque em “Copiar endereço”.</li>
                <li>No computador, abra calendar.google.com → “Outras agendas” → “+” → “Do URL”.</li>
                <li>Cole o endereço e confirme. A agenda aparece no celular em alguns minutos.</li>
                <li>No app Google Agenda, abra a agenda “Agenda Pedro Souza” e ative as notificações.</li>
              </ol>
              <p className="mt-1.5">No iPhone, ao assinar, deixe desligada a opção “Remover Alertas” para o alarme tocar.</p>
            </details>
            <button
              type="button"
              className="w-max text-[13px] font-semibold text-fg-3 underline"
              onClick={() =>
                start(async () => {
                  const r = await resetCalendarToken();
                  if (r.ok && r.data) {
                    setToken(r.data.token);
                    toast.success("Endereço trocado. O antigo parou de funcionar.");
                  } else if (!r.ok) toast.error(r.error);
                })
              }
            >
              Trocar endereço (se tiver compartilhado sem querer)
            </button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await resetCalendarToken();
                if (r.ok && r.data) setToken(r.data.token);
                else if (!r.ok) toast.error(r.error);
              })
            }
          >
            <CalendarPlus /> Criar endereço da agenda
          </Button>
        )}
      </div>

      {p.cronUrl && (
        <details className="border-t border-line pt-4 text-[14px] text-fg-2">
          <summary className="cursor-pointer font-semibold">Agendador dos avisos (configuração técnica)</summary>
          <p className="mt-1.5">
            Para os avisos saírem na hora certa, um agendador gratuito (cron-job.org) chama este endereço a cada 5 minutos. Não compartilhe.
          </p>
          <Button variant="secondary" className="mt-2" onClick={() => copy(p.cronUrl!, "Endereço do agendador copiado")}>
            <Check /> Copiar endereço do agendador
          </Button>
        </details>
      )}
    </div>
  );
}
