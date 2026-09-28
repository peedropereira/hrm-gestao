import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Relatórios" };

export default function ReportsPage() {
  return (
    <ComingSoon title="Relatórios" phase={4}>
      Ações por setor, evolução das metas e necessidades com custo total, com exportação para Excel e PDF.
    </ComingSoon>
  );
}
