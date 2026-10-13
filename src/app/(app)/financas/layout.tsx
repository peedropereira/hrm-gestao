import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { ensureFinanceSetup, getAccounts, getCategories } from "@/lib/finance";
import { FinProvider, FinTabs } from "@/components/fin/fin-ui";

export default async function FinanceLayout({ children }: LayoutProps<"/financas">) {
  const user = await requireUser();
  await ensureFinanceSetup(user.id);
  const [categories, { accounts }] = await Promise.all([getCategories(user.id), getAccounts(user.id)]);
  return (
    <FinProvider accounts={accounts} categories={categories}>
      <div className="mx-auto max-w-[1180px]">
        <header className="px-5 pb-3 pt-3 md:px-7 md:pt-6">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px]">Finanças</h1>
          <p className="text-[15px] font-medium text-fg-3 md:text-[14px]">Suas contas pessoais: gastos, fixos, cartões e orçamento.</p>
        </header>
        <Suspense>
          <FinTabs />
        </Suspense>
        {children}
      </div>
    </FinProvider>
  );
}
