import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

// Proxy: nenhuma página ou API abre sem login.
const { auth } = NextAuth(authConfig);

const PUBLIC = ["/login", "/api/auth", "/manifest.webmanifest", "/sw.js", "/offline", "/icons"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  if (!req.auth?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl.origin);
    if (pathname !== "/") url.searchParams.set("voltar", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|woff2?)$).*)"],
};
