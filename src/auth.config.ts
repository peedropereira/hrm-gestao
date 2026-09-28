import type { NextAuthConfig } from "next-auth";

// Configuração leve, sem banco: usada pelo proxy para checar a sessão em toda requisição.
export const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: THIRTY_DAYS },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id: string }).id;
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 1;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        (session.user as { sv?: number }).sv = token.sv as number;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
