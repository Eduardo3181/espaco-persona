import type { NextConfig } from "next";

// Sistema interno com login: todas as páginas dependem do usuário logado,
// então usamos renderização dinâmica comum (sem Cache Components).
const nextConfig: NextConfig = {
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
