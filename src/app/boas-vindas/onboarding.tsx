"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CalendarCheck, Inbox, ListChecks, Plus } from "lucide-react";
import { finishOnboarding } from "@/app/actions/account";
import { Button } from "@/components/button";
import { FlangeMark } from "@/components/brand";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Plus,
    title: "Capture tudo em uma linha",
    text: "Toque no botão Capturar (ou aperte C no computador) e escreva como fala: “cobrar Marcos orçamento compressor sexta #manutencao”. O sistema separa pessoa, prazo e setor sozinho.",
    tag: "1 · Capturar",
  },
  {
    icon: Inbox,
    title: "Trie a Caixa de Entrada",
    text: "O que não virou ação na hora fica na Caixa de Entrada. Com um toque, cada item vira ação, demanda, necessidade ou nota, ou é descartado.",
    tag: "2 · Triar",
  },
  {
    icon: ListChecks,
    title: "Execute e revise",
    text: "Abra o Painel do Dia toda manhã. Deslize para concluir ou adiar, cobre quem está devendo retorno e, na sexta, faça a revisão da semana.",
    tag: "3 · Executar e revisar",
  },
];

export function Onboarding({ name }: { name: string }) {
  const [i, setI] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const done = () =>
    start(async () => {
      await finishOnboarding();
      router.replace("/hoje");
    });

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col">
        <div className="flex items-center justify-between">
          <FlangeMark size={36} />
          <button type="button" onClick={done} className="tap px-2 text-[15px] font-semibold text-fg-3">
            Pular
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-center py-10">
          {i === 0 && <p className="mb-6 text-[17px] text-fg-2">Olá, {name}. Três telas e você está pronto.</p>}
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              <span className="grid size-16 place-items-center rounded-[20px] bg-ac-soft text-ac-text">
                <step.icon className="size-8" />
              </span>
              <p className="mt-6 font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-ac-text">{step.tag}</p>
              <h1 className="mt-2 text-balance text-[30px] font-bold leading-[1.12] tracking-[-0.025em]">{step.title}</h1>
              <p className="mt-3 text-[17px] leading-relaxed text-fg-2">{step.text}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="grid gap-5">
          <div className="flex justify-center gap-2" aria-label={`Passo ${i + 1} de ${STEPS.length}`}>
            {STEPS.map((_, n) => (
              <span key={n} className={cn("h-2 rounded-full transition-all", n === i ? "w-6 bg-ac" : "w-2 bg-line-strong")} />
            ))}
          </div>
          <Button block disabled={pending} onClick={() => (last ? done() : setI(i + 1))}>
            {last ? (
              <>
                <CalendarCheck /> Abrir o Painel do Dia
              </>
            ) : (
              <>
                Continuar <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
