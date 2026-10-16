import type { NextConfig } from "next";

// Sistema interno com login: todas as páginas dependem do usuário logado,
// então usamos renderização dinâmica comum (sem Cache Components).
const nextConfig: NextConfig = {
  // Permite testar pelo celular na mesma rede Wi-Fi durante o desenvolvimento.
  allowedDevOrigins: ["192.168.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
