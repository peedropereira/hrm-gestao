import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadActionExtra } from "@/lib/action-extra";

export async function GET(_req: Request, ctx: RouteContext<"/api/acoes/[id]">) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  const { id } = await ctx.params;
  const extra = await loadActionExtra(ownerId, id);
  if (!extra) return NextResponse.json({ error: "Ação não encontrada." }, { status: 404 });
  return NextResponse.json(extra);
}
