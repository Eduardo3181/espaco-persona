"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { classeInput } from "@/components/ui";

export type OpcaoBusca = { id: string; nome: string; grupo: string; detalhe?: string };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Campo com lupa: digite parte do nome e escolha na lista (sem acento também funciona).
 * Teclado: ↑ ↓ para navegar, Enter para escolher, Esc para fechar.
 */
export function BuscaItem({ opcoes, aoEscolher, placeholder = "Buscar…", rotulo }: {
  opcoes: OpcaoBusca[];
  aoEscolher: (id: string) => void;
  placeholder?: string;
  rotulo: string;
}) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const listaId = useId();
  const campo = useRef<HTMLInputElement>(null);
  const fechar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abrir = () => { if (fechar.current) clearTimeout(fechar.current); setAberto(true); };

  const filtradas = useMemo(() => {
    const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
    const lista = palavras.length
      ? opcoes.filter((o) => { const n = semAcento(o.nome); return palavras.every((p) => n.includes(p)); })
      : opcoes;
    return lista.slice(0, 80);
  }, [termo, opcoes]);

  const escolher = (id: string) => {
    aoEscolher(id);
    setTermo("");
    setAtivo(0);
    setAberto(false);
  };

  const teclado = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, filtradas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (aberto && filtradas[ativo]) escolher(filtradas[ativo].id); }
    else if (e.key === "Escape") { setAberto(false); }
  };

  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute top-3 left-3 text-suave" aria-hidden />
      <input
        ref={campo}
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAtivo(0); abrir(); }}
        onFocus={abrir}
        onBlur={() => { fechar.current = setTimeout(() => setAberto(false), 150); }}
        onKeyDown={teclado}
        placeholder={placeholder}
        aria-label={rotulo}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        className={`${classeInput} pl-10`}
      />
      {aberto && (
        <ul id={listaId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-borda bg-cartao shadow-lg">
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-suave">Nada encontrado para “{termo}”.</li>}
          {filtradas.map((o, i) => {
            const mostrarGrupo = i === 0 || filtradas[i - 1].grupo !== o.grupo;
            return (
              <li key={o.id} role="presentation">
                {mostrarGrupo && <p className="bg-fundo px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose">{o.grupo}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === ativo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(o.id)}
                  onMouseEnter={() => setAtivo(i)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm ${i === ativo ? "bg-agendado-fundo" : ""}`}
                >
                  <span>{o.nome}</span>
                  {o.detalhe && <span className="shrink-0 text-xs text-suave">{o.detalhe}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
