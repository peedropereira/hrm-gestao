"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { actionUser } from "@/lib/session";
import { clearDemoData, loadDemoData } from "@/lib/demo";
import { todayISO } from "@/lib/dates";
import { fail, refreshAll, type Result } from "./_shared";

const LOCK_MINUTES = 15;
const MAX_FAILS = 5;

export type LoginState = { error?: string; login?: string } | undefined;

/** Login com bloqueio temporário após 5 tentativas erradas. */
export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const login = String(form.get("login") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const back = String(form.get("voltar") ?? "/hoje");
  if (!login || !password) return { error: "Informe usuário e senha.", login };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const [failsLogin, failsIp] = await Promise.all([
    db.loginAttempt.findMany({ where: { login, success: false, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } }),
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (failsLogin.length >= MAX_FAILS || failsIp >= MAX_FAILS * 4) {
    const oldest = failsLogin[failsLogin.length - MAX_FAILS]?.createdAt ?? new Date();
    const mins = Math.max(1, Math.ceil((oldest.getTime() + LOCK_MINUTES * 60_000 - Date.now()) / 60_000));
    return { login, error: `Muitas tentativas erradas. Por segurança, o acesso está bloqueado por ${mins} min.` };
  }

  try {
    await signIn("credentials", {
      login,
      password,
      redirectTo: back.startsWith("/") && !back.startsWith("//") ? back : "/hoje",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      const left = MAX_FAILS - failsLogin.length - 1;
      return {
        login,
        error:
          left > 0
            ? `Usuário ou senha incorretos. ${left} ${left === 1 ? "tentativa restante" : "tentativas restantes"}.`
            : `Usuário ou senha incorretos. Acesso bloqueado por ${LOCK_MINUTES} min.`,
      };
    }
    throw e; // redirecionamento de sucesso
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login?saiu=1" });
}

const pwSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    next: z.string().min(10, "A nova senha precisa ter pelo menos 10 caracteres.").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "A confirmação não é igual à nova senha.", path: ["confirm"] });

export async function changePassword(raw: z.input<typeof pwSchema>): Promise<Result> {
  try {
    const u = await actionUser();
    const d = pwSchema.parse(raw);
    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await bcrypt.compare(d.current, user.passwordHash))) throw new Error("A senha atual não confere.");
    await db.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(d.next, 12), sessionVersion: { increment: 1 } },
    });
    // Sessões de outros aparelhos deixam de valer; esta também, então pedimos novo login.
    await signOut({ redirect: false });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function finishOnboarding(): Promise<Result> {
  try {
    const u = await actionUser();
    await db.user.update({ where: { id: u.id }, data: { onboardingDone: true } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const settingsSchema = z.object({
  redOverdueMin: z.number().int().min(1).max(20),
  kpiRedPercent: z.number().int().min(1).max(100),
  delegateAlertDays: z.number().int().min(1).max(30),
});

export async function updateSettings(raw: z.input<typeof settingsSchema>): Promise<Result> {
  try {
    const u = await actionUser();
    const d = settingsSchema.parse(raw);
    await db.userSettings.upsert({ where: { userId: u.id }, create: { userId: u.id, ...d }, update: d });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadDemo(): Promise<Result> {
  try {
    const u = await actionUser();
    const existing = await db.action.count({ where: { ownerId: u.id, demo: true } });
    if (existing) throw new Error("Os dados de exemplo já estão carregados.");
    await loadDemoData(db, u.id, todayISO());
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearDemo(): Promise<Result> {
  try {
    const u = await actionUser();
    await clearDemoData(db, u.id);
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
