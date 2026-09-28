import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  login: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { login: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { login, password } = parsed.data;
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request?.headers?.get("x-real-ip") ||
          "desconhecido";

        const user = await db.user.findUnique({ where: { login } });
        // Compara mesmo sem usuário, para não revelar se o login existe pelo tempo de resposta.
        const ok = await bcrypt.compare(
          password,
          user?.passwordHash ?? "$2b$12$iAt3UYlPbA99xrQy9dMRweaFoZ3mhy58iljGs4UgdEHfd.utzYsIG",
        );
        await db.loginAttempt.create({ data: { login, ip, success: !!(user && ok) } });
        if (!user || !ok) return null;
        return { id: user.id, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});
