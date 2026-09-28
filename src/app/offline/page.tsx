import { FlangeMark } from "@/components/brand";

export const dynamic = "force-static";
export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-[360px]">
        <FlangeMark size={48} className="mx-auto" />
        <h1 className="mt-6 text-[26px] font-bold tracking-[-0.02em]">Sem conexão</h1>
        <p className="mt-2 text-[17px] text-fg-2">Esta tela ainda não tinha sido aberta neste aparelho. Assim que o sinal voltar, ela carrega normalmente.</p>
      </div>
    </div>
  );
}
