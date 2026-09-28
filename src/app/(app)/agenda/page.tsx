import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage() {
  return (
    <ComingSoon title="Agenda" phase={2}>
      Visões de dia, semana e mês, reuniões recorrentes e atas que geram ações. Por enquanto, os compromissos de hoje aparecem no Painel do Dia.
    </ComingSoon>
  );
}
