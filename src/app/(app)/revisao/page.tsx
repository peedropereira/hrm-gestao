import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Revisão semanal" };

export default function ReviewPage() {
  return (
    <ComingSoon title="Revisão semanal" phase={4}>
      Revisão guiada de sexta-feira e PDF de uma página para a reunião com a diretoria.
    </ComingSoon>
  );
}
