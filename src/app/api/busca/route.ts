import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { SearchHit } from "@/components/search-palette";

// Busca global: ações, demandas, necessidades, notas, eventos, setores, pessoas e caixa de entrada.
export async function GET(req: NextRequest) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (raw.length < 2) return NextResponse.json({ hits: [] });

  const isTag = raw.startsWith("#");
  const term = isTag ? raw.slice(1).toLowerCase() : raw;
  const c = { contains: term, mode: "insensitive" as const };
  const tagWhere = { tags: { some: { name: { startsWith: term } } } };
  const base = { ownerId, deletedAt: null };
  const take = 8;

  const [actions, demands, needs, notes, events, sectors, people, inbox, files] = await Promise.all([
    db.action.findMany({
      where: { ...base, ...(isTag ? tagWhere : { OR: [{ title: c }, { description: c }] }) },
      select: { id: true, title: true, status: true, sector: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take,
    }),
    db.demand.findMany({
      where: { ...base, ...(isTag ? tagWhere : { OR: [{ title: c }, { details: c }] }) },
      select: { id: true, title: true, sector: { select: { name: true, slug: true } } },
      take,
    }),
    db.need.findMany({
      where: { ...base, ...(isTag ? tagWhere : { OR: [{ title: c }, { details: c }] }) },
      select: { id: true, title: true, sector: { select: { name: true, slug: true } } },
      take,
    }),
    db.note.findMany({
      where: { ...base, ...(isTag ? tagWhere : { content: c }) },
      select: { id: true, content: true, sector: { select: { name: true, slug: true } } },
      take,
    }),
    isTag ? Promise.resolve([]) : db.event.findMany({ where: { ...base, OR: [{ title: c }, { minutes: c }] }, select: { id: true, title: true, startsAt: true }, take }),
    isTag ? Promise.resolve([]) : db.sector.findMany({ where: { ...base, name: c }, select: { id: true, name: true, slug: true }, take }),
    isTag ? Promise.resolve([]) : db.person.findMany({ where: { ...base, name: c }, select: { id: true, name: true, role: true, sector: { select: { slug: true, name: true } } }, take }),
    isTag ? Promise.resolve([]) : db.inboxItem.findMany({ where: { ownerId, status: "PENDING", text: c }, select: { id: true, text: true }, take }),
    isTag
      ? Promise.resolve([])
      : db.attachment.findMany({
          where: { ownerId, OR: [{ name: c }, { caption: c }] },
          select: {
            id: true,
            name: true,
            sector: { select: { slug: true, name: true } },
            demand: { select: { sector: { select: { slug: true, name: true } } } },
            need: { select: { sector: { select: { slug: true, name: true } } } },
            note: { select: { sector: { select: { slug: true, name: true } } } },
            update: { select: { actionId: true, action: { select: { title: true } } } },
            inboxItemId: true,
          },
          orderBy: { createdAt: "desc" },
          take,
        }),
  ]);
  const fileHits: SearchHit[] = files.map((f) => {
    const sec = f.sector ?? f.demand?.sector ?? f.need?.sector ?? f.note?.sector ?? null;
    const href = f.update ? `/acoes/${f.update.actionId}` : sec ? `/setores/${sec.slug}?aba=arquivos` : "/caixa";
    const sub = f.update ? `Ação: ${f.update.action.title.slice(0, 50)}` : sec ? sec.name : "Caixa de entrada";
    return { type: "file" as const, id: f.id, title: f.name ?? "Arquivo", sub, href };
  });

  const hits: SearchHit[] = [
    ...sectors.map((s) => ({ type: "sector" as const, id: s.id, title: s.name, sub: "Página do setor", href: `/setores/${s.slug}` })),
    ...actions.map((a) => ({
      type: "action" as const,
      id: a.id,
      title: a.title,
      sub: `${a.sector?.name ?? "Sem setor"}${a.status === "DONE" ? " · concluída" : ""}`,
      href: `/acoes/${a.id}`,
    })),
    ...demands.map((d) => ({ type: "demand" as const, id: d.id, title: d.title, sub: d.sector.name, href: `/setores/${d.sector.slug}?aba=demandas` })),
    ...needs.map((n) => ({ type: "need" as const, id: n.id, title: n.title, sub: n.sector.name, href: `/setores/${n.sector.slug}?aba=necessidades` })),
    ...notes.map((n) => ({
      type: "note" as const,
      id: n.id,
      title: n.content.slice(0, 90),
      sub: n.sector?.name ?? "Geral",
      href: n.sector ? `/setores/${n.sector.slug}?aba=notas` : "/setores",
    })),
    ...people.map((p) => ({
      type: "person" as const,
      id: p.id,
      title: p.name,
      sub: [p.role, p.sector?.name].filter(Boolean).join(" · ") || "Pessoa",
      href: p.sector ? `/setores/${p.sector.slug}?aba=pessoas` : "/config",
    })),
    ...events.map((e) => ({ type: "event" as const, id: e.id, title: e.title, sub: e.startsAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), href: "/agenda" })),
    ...inbox.map((i) => ({ type: "inbox" as const, id: i.id, title: i.text, sub: "Aguardando triagem", href: "/caixa" })),
    ...fileHits,
  ];
  return NextResponse.json({ hits: hits.slice(0, 30) });
}
