"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { classeBotao } from "@/components/ui";

/** Texto do pedido com botões para copiar e para enviar pelo WhatsApp. */
export function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setCopiado(false); }
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea readOnly value={texto} rows={Math.min(texto.split("\n").length + 1, 16)} aria-label="Texto do pedido"
        className="w-full rounded-lg border border-borda bg-fundo p-3 font-mono text-sm" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copiar} className={classeBotao("secundario")}><Copy size={16} aria-hidden /> {copiado ? "Copiado!" : "Copiar texto"}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sucesso px-4 text-sm font-semibold text-white hover:opacity-90">
          <MessageCircle size={16} aria-hidden /> Enviar pelo WhatsApp
        </a>
      </div>
    </div>
  );
}
