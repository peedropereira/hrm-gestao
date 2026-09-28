import { ImageResponse } from "next/og";

// Ícones do app gerados a partir do símbolo (flange). Tamanhos pedidos pelo manifesto e pelo iPhone.
const SIZES: Record<string, { size: number; pad: number; round: boolean }> = {
  "icon-192.png": { size: 192, pad: 0.16, round: true },
  "icon-512.png": { size: 512, pad: 0.16, round: true },
  "maskable-512.png": { size: 512, pad: 0.26, round: false },
  "apple-touch-icon.png": { size: 180, pad: 0.18, round: false },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(SIZES).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[file]">) {
  const { file } = await ctx.params;
  const spec = SIZES[file];
  if (!spec) return new Response("Não encontrado", { status: 404 });
  const { size, pad, round } = spec;
  const inner = Math.round(size * (1 - pad * 2));
  const bolts = [0, 60, 120, 180, 240, 300].map((a) => {
    const r = inner * 0.225;
    const rad = ((a - 90) * Math.PI) / 180;
    return { x: inner / 2 + r * Math.cos(rad), y: inner / 2 + r * Math.sin(rad) };
  });
  const ring = inner * 0.33;
  const hole = inner * 0.12;
  const stroke = Math.max(3, inner * 0.07);
  const bolt = inner * 0.042;

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#111519", borderRadius: round ? size * 0.22 : 0 }}>
        <div style={{ width: inner, height: inner, position: "relative", display: "flex" }}>
          <div style={{ position: "absolute", left: inner / 2 - ring, top: inner / 2 - ring, width: ring * 2, height: ring * 2, borderRadius: "50%", border: `${stroke}px solid #3dbacb` }} />
          <div style={{ position: "absolute", left: inner / 2 - hole, top: inner / 2 - hole, width: hole * 2, height: hole * 2, borderRadius: "50%", border: `${stroke}px solid #3dbacb` }} />
          {bolts.map((b, i) => (
            <div key={i} style={{ position: "absolute", left: b.x - bolt, top: b.y - bolt, width: bolt * 2, height: bolt * 2, borderRadius: "50%", background: "#3dbacb" }} />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
