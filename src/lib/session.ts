import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/**
 * Usuário logado, validado contra o banco (a troca de senha incrementa
 * sessionVersion e invalida sessões antigas em outros aparelhos).
 */
export const requireUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, login: true, role: true, sessionVersion: true, onboardingDone: true },
  });
  const sv = (session.user as { sv?: number }).sv ?? 1;
  if (!user || user.sessionVersion !== sv) redirect("/login?sessao=expirada");
  return user;
});

/** Para Server Actions: lança erro em vez de redirecionar. */
export async function actionUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Sessão expirada. Entre novamente.");
  const user = await db.user.findUnique({ where: { id }, select: { id: true, sessionVersion: true } });
  const sv = (session.user as { sv?: number }).sv ?? 1;
  if (!user || user.sessionVersion !== sv) throw new Error("Sessão expirada. Entre novamente.");
  return user;
}
