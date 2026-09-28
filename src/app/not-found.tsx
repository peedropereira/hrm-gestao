import Link from "next/link";
import { EmptyState } from "@/components/ds";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[560px] px-4 pt-16">
      <EmptyState title="Página não encontrada">
        O item pode ter sido excluído.{" "}
        <Link href="/hoje" className="font-semibold text-ac-text underline">
          Voltar para Hoje
        </Link>
      </EmptyState>
    </div>
  );
}
