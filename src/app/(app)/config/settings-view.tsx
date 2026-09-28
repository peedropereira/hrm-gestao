"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { Card, PanelHead } from "@/components/ds";
import { Sheet } from "@/components/sheet";
import { changePassword, clearDemo, loadDemo, logoutAction, updateSettings } from "@/app/actions/account";
import { Field, inputCls } from "../setores/sector-forms";
import { cn } from "@/lib/utils";

/** Grava o tema no cookie (lido antes da pintura) e aplica na hora. */
function persistTheme(v: string) {
  document.cookie = `tema=${v}; path=/; max-age=31536000; samesite=lax`;
  const dark = v === "escuro" || (v === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

type Settings ={ redOverdueMin: number; kpiRedPercent: number; delegateAlertDays: number };

function Section({ title, children, desc }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <Card>
      <PanelHead title={title} />
      <div className="grid gap-4 p-4">
        {desc && <p className="-mt-1 text-[15px] text-fg-3 md:text-[14px]">{desc}</p>}
        {children}
      </div>
    </Card>
  );
}

export function SettingsView({ login, theme, hasDemo, settings }: { login: string; theme: string; hasDemo: boolean; settings: Settings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [s, setS] = useState(settings);
  const [t, setT] = useState(theme);
  const [confirmClear, setConfirmClear] = useState(false);

  const applyTheme = (v: string) => {
    setT(v);
    persistTheme(v);
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="px-5 pb-3 pt-3 md:px-7 md:pt-6">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Configurações</h1>
        <p className="text-[15px] font-medium text-fg-3 md:text-[14px]">Conectado como {login}</p>
      </header>

      <div className="grid gap-4 px-4 md:px-7">
        <Section title="Aparência">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
            {(
              [
                ["claro", "Claro", Sun],
                ["escuro", "Escuro", Moon],
                ["sistema", "Automático", Monitor],
              ] as const
            ).map(([v, l, I]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={t === v}
                onClick={() => applyTheme(v)}
                className={cn("flex h-14 flex-col items-center justify-center gap-1 rounded-[12px] border text-[14px] font-semibold", t === v ? "border-ac bg-ac-soft text-ac-text" : "border-line text-fg-2")}
              >
                <I className="size-5" />
                {l}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Trocar senha" desc="Ao trocar, todos os aparelhos conectados precisam entrar de novo.">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await changePassword(pw);
                if (!r.ok) return void toast.error(r.error);
                router.replace("/login?senha=1");
              });
            }}
          >
            <Field label="Senha atual" htmlFor="pw-cur">
              <input id="pw-cur" type="password" autoComplete="current-password" className={inputCls} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            </Field>
            <Field label="Nova senha" htmlFor="pw-new" hint="Pelo menos 10 caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar.">
              <input id="pw-new" type="password" autoComplete="new-password" className={inputCls} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={10} />
            </Field>
            <Field label="Confirmar nova senha" htmlFor="pw-conf">
              <input id="pw-conf" type="password" autoComplete="new-password" className={inputCls} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
            </Field>
            <Button type="submit" disabled={pending}>
              Trocar senha
            </Button>
          </form>
        </Section>

        <Section title="Semáforo e alertas" desc="Regras usadas no Painel do Dia e nas páginas de setor.">
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await updateSettings(s);
                if (r.ok) toast.success("Regras salvas");
                else toast.error(r.error);
              });
            }}
          >
            <Field label="Vermelho a partir de" htmlFor="st-red" hint="ações atrasadas no setor">
              <input id="st-red" type="number" min={1} max={20} className={inputCls} value={s.redOverdueMin} onChange={(e) => setS({ ...s, redOverdueMin: Number(e.target.value) })} />
            </Field>
            <Field label="Meta fora do alvo acima de" htmlFor="st-kpi" hint="% para ficar vermelho">
              <input id="st-kpi" type="number" min={1} max={100} className={inputCls} value={s.kpiRedPercent} onChange={(e) => setS({ ...s, kpiRedPercent: Number(e.target.value) })} />
            </Field>
            <Field label="Alertar delegadas após" htmlFor="st-del" hint="dias úteis sem retorno">
              <input id="st-del" type="number" min={1} max={30} className={inputCls} value={s.delegateAlertDays} onChange={(e) => setS({ ...s, delegateAlertDays: Number(e.target.value) })} />
            </Field>
            <Button type="submit" disabled={pending} className="md:col-span-3">
              Salvar regras
            </Button>
          </form>
        </Section>

        <Section title="Backup" desc="Baixe uma cópia completa dos seus dados. O banco Neon também faz cópias automáticas (veja o README).">
          <a href="/api/exportar" className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-line-strong bg-surface text-[16px] font-semibold hover:bg-surface-2 md:h-10 md:text-[14px]">
            <Download className="size-[18px]" /> Baixar todos os dados (JSON)
          </a>
          <p className="text-[13px] text-fg-3">Exportação em Excel e importação de backup chegam na Fase 4.</p>
        </Section>

        <Section title="Dados de exemplo" desc="Ações, metas e setores fictícios de caldeiraria para você conhecer o sistema. Os setores e seus dados reais nunca são apagados.">
          {hasDemo ? (
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              Limpar dados de exemplo
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await loadDemo();
                  if (r.ok) toast.success("Exemplos carregados");
                  else toast.error(r.error);
                })
              }
            >
              Carregar dados de exemplo
            </Button>
          )}
        </Section>

        <form action={logoutAction}>
          <Button type="submit" variant="secondary" block>
            <LogOut /> Sair deste aparelho
          </Button>
        </form>
      </div>

      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Limpar dados de exemplo?" description="Remove as ações, demandas, necessidades, metas, notas e pessoas de demonstração. O que você cadastrou continua.">
        <div className="grid gap-2 md:grid-cols-2">
          <Button variant="secondary" block onClick={() => setConfirmClear(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            block
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await clearDemo();
                setConfirmClear(false);
                if (r.ok) toast.success("Dados de exemplo removidos");
                else toast.error(r.error);
              })
            }
          >
            Limpar exemplos
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
