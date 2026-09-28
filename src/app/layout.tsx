import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "HRM Gestão", template: "%s · HRM Gestão" },
  description: "Gestão pessoal do Gerente Geral da HRM Caldeiraria Industrial.",
  applicationName: "HRM Gestão",
  appleWebApp: { capable: true, title: "HRM Gestão", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1114" },
  ],
};

// Aplica o tema antes da primeira pintura (sem piscar): cookie "tema" = claro | escuro | sistema.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )tema=([^;]+)/);var t=m?m[1]:'sistema';var d=t==='escuro'||(t==='sistema'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="bottom-center"
          offset={{ bottom: 32 }}
          mobileOffset={{ bottom: "calc(104px + env(safe-area-inset-bottom))" }}
          duration={5000}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                "flex min-h-[52px] w-[calc(100vw-28px)] max-w-[380px] items-center gap-2.5 rounded-[14px] bg-[var(--toast-bg)] py-1 pl-4 pr-1 text-[15px] font-medium text-[var(--toast-fg)] shadow-[0_14px_30px_-10px_rgba(0,0,0,.45)]",
              title: "flex-1",
              actionButton: "h-11 shrink-0 rounded-[10px] px-3.5 font-bold text-[var(--toast-ac)]",
              icon: "[&_svg]:size-[18px]",
              error: "!bg-[var(--red-solid)] !text-white",
            },
          }}
        />
      </body>
    </html>
  );
}
