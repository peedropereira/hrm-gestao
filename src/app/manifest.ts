import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HRM Gestão",
    short_name: "HRM Gestão",
    description: "Agenda, ações, setores e metas do Gerente Geral da HRM Caldeiraria.",
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
    shortcuts: [
      { name: "Capturar", url: "/hoje?capturar=1" },
      { name: "Ações atrasadas", url: "/acoes?f=atrasadas" },
      { name: "Caixa de entrada", url: "/caixa" },
    ],
  };
}
