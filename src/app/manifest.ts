import type { MetadataRoute } from "next";

// Permite instalar o sistema no celular como aplicativo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Espaço Persona – Hair and Beauty",
    short_name: "Espaço Persona",
    description: "Sistema de gestão do Espaço Persona",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1C1B1F",
    theme_color: "#1C1B1F",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
