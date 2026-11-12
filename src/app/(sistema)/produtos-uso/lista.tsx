"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { BotaoLink, Etiqueta, Vazio, classeInput } from "@/components/ui";
import { formatarReais, semAcento } from "@/lib/formato";
import {
  TIPOS_USO, custoPorGrama, emEmbalagens, formatarCustoGrama, nomeEmbalagem, nomeProdutoUso, type ProdutoUso,
} from "@/lib/produtos-uso";

/** Lista dos produtos de uso com busca por número ou nome e filtro por tipo e família. */
export function ListaProdutosUso({ produtos }: { produtos: ProdutoUso[] }) {
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState("");
  const [familia, setFamilia] = useState("");
  const familias = useMemo(() => [...new Set(produtos.map((p) => p.familia).filter((f): f is string => Boolean(f)))], [produtos]);

  const visiveis = useMemo(() => {
    const t = semAcento(termo.trim()).replace(",", "."); // 5,0 = 5.0
    return produtos.filter((p) =>
      (!tipo || p.tipo === tipo) && (!familia || p.familia === familia)
      && (!t || (p.numero ?? "").toLowerCase().startsWith(t) || semAcento(nomeProdutoUso(p)).includes(t) || semAcento(p.nome).includes(t)));
  }, [produtos, termo, tipo, familia]);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_14rem]">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-3 left-3 text-suave" aria-hidden />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} type="search" placeholder="Buscar por número (ex.: 8.3 ou 8,3) ou nome…"
            aria-label="Buscar produto de uso" autoComplete="off" className={`${classeInput} pl-10`} />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo" className={classeInput}>
          <option value="">Todos os tipos</option>
          {TIPOS_USO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
        </select>
        <select value={familia} onChange={(e) => setFamilia(e.target.value)} aria-label="Filtrar por família" className={classeInput}>
          <option value="">Todas as famílias</option>
          {familias.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {visiveis.length === 0 ? <Vazio>Nenhum produto encontrado.</Vazio> : (
        <ul className="divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-cartao">
          {visiveis.map((p) => {
            const estoque = emEmbalagens(p.estoque_qtd, p.embalagem_qtd);
            const baixo = Number(p.estoque_minimo_embalagens) > 0 && (estoque ?? 0) <= Number(p.estoque_minimo_embalagens);
            return (
              <li key={p.id} className={`flex items-start gap-3 px-4 py-3 ${p.ativo ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {nomeProdutoUso(p)} {!p.ativo && <Etiqueta tom="erro">Inativo</Etiqueta>} {baixo && <Etiqueta tom="aviso">Estoque baixo</Etiqueta>}
                  </p>
                  <p className="text-xs text-suave">
                    {TIPOS_USO.find((t) => t.id === p.tipo)?.rotulo}{p.familia && ` · ${p.familia}`}
                    {p.embalagem_qtd ? ` · ${nomeEmbalagem(p.tipo, 1)} de ${Number(p.embalagem_qtd).toLocaleString("pt-BR")} ${p.unidade}` : " · falta o tamanho da embalagem"}
                    {p.observacao && ` · ${p.observacao}`}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-4 text-right text-sm">
                  <p><span className="block text-xs text-suave">Compra</span>{p.valor_compra_centavos ? formatarReais(p.valor_compra_centavos) : "—"}</p>
                  <p><span className="block text-xs text-suave">Por {p.unidade}</span>{p.valor_compra_centavos ? formatarCustoGrama(custoPorGrama(p)) : "—"}</p>
                  <p><span className="block text-xs text-suave">Estoque</span>{estoque === null ? "—" : `${estoque.toLocaleString("pt-BR")} ${nomeEmbalagem(p.tipo, estoque)}`}</p>
                </div>
                <BotaoLink href={`/produtos-uso?editar=${p.id}`} variante="fantasma" className="shrink-0 px-2" aria-label={`Editar ${nomeProdutoUso(p)}`}>
                  <Pencil size={18} />
                </BotaoLink>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
