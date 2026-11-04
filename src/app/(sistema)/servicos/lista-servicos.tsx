"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Etiqueta, Vazio, classeInput } from "@/components/ui";
import { formatarDuracao, formatarReais, semAcento } from "@/lib/formato";
import { Grupo, Linha } from "./pecas";

export type ServicoLista = {
  id: string; nome: string; ativo: boolean; duracao_min: number; preco_centavos: number;
  /** Só para o dono: comissão de cada profissional (null = sem regra) */
  comissoes?: { nome: string; texto: string | null }[];
};
export type GrupoServicos = { categoria: { id: string; nome: string }; itens: ServicoLista[] };

/** Lista de serviços por categoria, com busca por parte do nome e filtro por categoria. */
export function ListaServicos({ grupos, ehDono }: { grupos: GrupoServicos[]; ehDono: boolean }) {
  const [termo, setTermo] = useState("");
  const [categoria, setCategoria] = useState("");

  const visiveis = useMemo(() => {
    const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
    return grupos
      .filter((g) => !categoria || g.categoria.id === categoria)
      .map((g) => ({ ...g, itens: g.itens.filter((s) => { const n = semAcento(s.nome); return palavras.every((p) => n.includes(p)); }) }))
      .filter((g) => g.itens.length);
  }, [grupos, termo, categoria]);

  if (grupos.length === 0) return <Vazio>Nenhum serviço cadastrado ainda.</Vazio>;
  const total = visiveis.reduce((s, g) => s + g.itens.length, 0);
  const filtrando = Boolean(termo.trim() || categoria);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-3 left-3 text-suave" aria-hidden />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} type="search" placeholder="Buscar serviço pelo nome…"
            aria-label="Buscar serviço" autoComplete="off" className={`${classeInput} pl-10`} />
        </div>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoria" className={classeInput}>
          <option value="">Todas as categorias</option>
          {grupos.map((g) => <option key={g.categoria.id} value={g.categoria.id}>{g.categoria.nome}</option>)}
        </select>
      </div>
      {filtrando && (
        <p className="text-sm text-suave" aria-live="polite">
          {total === 0 ? "Nenhum serviço encontrado." : `${total} ${total === 1 ? "serviço encontrado" : "serviços encontrados"}.`}{" "}
          <button type="button" onClick={() => { setTermo(""); setCategoria(""); }} className="min-h-11 font-semibold text-rose">Limpar filtro</button>
        </p>
      )}
      {visiveis.map(({ categoria: c, itens }) => (
        <Grupo key={c.id} titulo={c.nome}>
          {itens.map((s) => (
            <Linha key={s.id} inativo={!s.ativo} ehDono={ehDono} nome={s.nome} editarHref={`/servicos?aba=servicos&editar=${s.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">{s.nome} {!s.ativo && <Etiqueta tom="erro">Inativo</Etiqueta>}</p>
                <p className="text-sm">
                  <span className="text-suave">{formatarDuracao(s.duracao_min)} · a partir de </span>
                  <span className="font-semibold">{formatarReais(s.preco_centavos)}</span>
                </p>
              </div>
              {s.comissoes && s.comissoes.length > 0 && (
                <p className="mt-1 text-xs text-suave">
                  Comissão:{" "}
                  {s.comissoes.map((c, i) => (
                    <span key={c.nome}>
                      {i > 0 && " · "}
                      {c.nome}{" "}
                      {c.texto ?? <span className="font-semibold text-aguardando">sem regra</span>}
                    </span>
                  ))}
                </p>
              )}
            </Linha>
          ))}
        </Grupo>
      ))}
    </>
  );
}
