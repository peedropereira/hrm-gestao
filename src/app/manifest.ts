import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pedro Souza · Gestão Pessoal",
    short_name: "Gestão PS",
    description: "Sistema de gestão pessoal de Pedro Souza: agenda, ações, setores e metas.",
    lang: "pt-BR",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111519",
    theme_color: "#0e6e7e",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: "Compartilhar → Gestão PS" com o PDF da fatura
    share_target: {
      action: "/financas/compartilhar",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", files: [{ name: "file", accept: ["application/pdf", ".pdf", "text/csv", ".csv", ".ofx", ".qfx", ".xlsx", "image/*"] }] },
    },
    shortcuts: [
      { name: "Capturar", url: "/hoje?capturar=1" },
      { name: "Falar", url: "/hoje?falar=1" },
      { name: "Ações atrasadas", url: "/acoes?f=atrasadas" },
      { name: "Caixa de entrada", url: "/caixa" },
    ],
  };
}
