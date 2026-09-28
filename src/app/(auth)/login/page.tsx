import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FlangeMark } from "@/components/brand";
import { LoginForm } from "./login-form";
import { ClearOfflineCache } from "./clear-cache";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  const sp = await searchParams;
  if (session?.user && !sp.sessao) redirect("/hoje");
  const voltar = typeof sp.voltar === "string" ? sp.voltar : "/hoje";
  const notice = sp.saiu ? "Você saiu com segurança." : sp.sessao ? "Sua sessão expirou ou a senha foi trocada. Entre novamente." : sp.senha ? "Senha alterada. Entre com a nova senha." : null;

  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#111519] p-12 text-[#e8ebee] md:flex md:flex-col md:justify-between">
        <div className="flex items-center gap-3">
          <FlangeMark size={40} bg="#3dbacb" fg="#03262b" />
          <div>
            <b className="block text-[17px]">HRM Gestão</b>
            <span className="text-[14px] text-[#8c96a0]">Caldeiraria Industrial · Arujá/SP</span>
          </div>
        </div>
        <div className="max-w-[440px]">
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6acfdc]">Capturar · Triar · Executar · Revisar</p>
          <h1 className="mt-3 text-balance text-[40px] font-bold leading-[1.08] tracking-[-0.03em]">Tudo que chega até você, com dono, prazo e status.</h1>
        </div>
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute -bottom-24 -right-24 size-[420px] opacity-[0.07]" aria-hidden="true">
          <circle cx="200" cy="200" r="180" fill="none" stroke="#fff" strokeWidth="20" />
          <circle cx="200" cy="200" r="70" fill="none" stroke="#fff" strokeWidth="20" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <circle key={a} cx={200 + 125 * Math.cos(((a - 90) * Math.PI) / 180)} cy={200 + 125 * Math.sin(((a - 90) * Math.PI) / 180)} r="16" fill="#fff" />
          ))}
        </svg>
      </section>
      <section className="flex flex-col justify-center px-6 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(32px+env(safe-area-inset-top))] md:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-3 md:hidden">
            <FlangeMark size={44} />
            <div>
              <b className="block text-[18px]">HRM Gestão</b>
              <span className="text-[15px] text-fg-3">Caldeiraria Industrial</span>
            </div>
          </div>
          <h2 className="text-[30px] font-bold tracking-[-0.025em]">Entrar</h2>
          <p className="mb-7 mt-1 text-[16px] text-fg-3">Você fica conectado por 30 dias neste aparelho.</p>
          {notice && <p className="mb-5 rounded-[12px] bg-ac-soft px-4 py-3 text-[15px] font-medium text-ac-text">{notice}</p>}
          <LoginForm voltar={voltar} />
          {sp.saiu && <ClearOfflineCache />}
        </div>
      </section>
    </div>
  );
}
