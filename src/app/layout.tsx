import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { RegistrarServiceWorker } from "@/components/registrar-sw";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Espaço Persona", template: "%s · Espaço Persona" },
  description: "Sistema de gestão do Espaço Persona – Hair and Beauty",
  icons: { icon: "/icones/favicon-48.png", apple: "/icones/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Espaço Persona", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1C1B1F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${cormorant.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
