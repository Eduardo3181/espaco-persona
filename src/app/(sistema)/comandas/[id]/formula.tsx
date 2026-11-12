"use client";

import { useState } from "react";
import { History, Trash2, X } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BuscaItem, type OpcaoBusca } from "@/components/busca-item";
import { classeInput } from "@/components/ui";
import { formatarReais } from "@/lib/formato";
import { formatarQuantidade } from "@/lib/produtos-uso";
import { adicionarFormula, removerFormula, repetirFormula } from "../actions";

export type LinhaFormula = { id: string; produto: string; quantidade: number; unidade: string; custo_centavos: number };
export type OpcaoProdutoUso = OpcaoBusca & { unidade: string };

/** "Produtos usados (fórmula)" de um serviço da comanda: um produto por linha, com custo. */
export function FormulaItem({ comandaId, itemId, linhas, produtos, aberta, podeRepetir }: {
  comandaId: string; itemId: string; linhas: LinhaFormula[]; produtos: OpcaoProdutoUso[]; aberta: boolean; podeRepetir: boolean;
}) {
  const [escolhido, setEscolhido] = useState<OpcaoProdutoUso | null>(null);
  const total = linhas.reduce((t, l) => t + l.custo_centavos, 0);
  if (!aberta && linhas.length === 0) return null;

  return (
    <div className="mt-1 w-full rounded-lg bg-fundo p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose">Produtos usados (fórmula)</p>
      {linhas.length > 0 && (
        <ul className="mb-2 flex flex-col">
          {linhas.map((l) => (
            <li key={l.id} className="flex min-h-9 items-center justify-between gap-2 text-sm">
              <span>{l.produto} — {formatarQuantidade(l.quantidade, l.unidade)}</span>
              <span className="flex items-center gap-1">
                <span className="text-xs text-suave">{formatarReais(l.custo_centavos)}</span>
                {aberta && (
                  <FormAcao acao={removerFormula}>
                    <input type="hidden" name="comanda_id" value={comandaId} /><input type="hidden" name="id" value={l.id} />
                    <BotaoEnviar variante="fantasma" pendente="…" className="min-h-9 px-2"><Trash2 size={15} aria-label={`Remover ${l.produto}`} /></BotaoEnviar>
                  </FormAcao>
                )}
              </span>
            </li>
          ))}
          <li className="flex justify-between border-t border-borda pt-1 text-xs font-semibold">
            <span>Custo dos produtos deste serviço</span><span>{formatarReais(total)}</span>
          </li>
        </ul>
      )}
      {aberta && (
        <div className="flex flex-col gap-2">
          <FormAcao acao={adicionarFormula} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto] sm:items-start">
            <input type="hidden" name="comanda_id" value={comandaId} />
            <input type="hidden" name="item_id" value={itemId} />
            {escolhido ? (
              <span className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-rose-claro bg-cartao pl-3 text-sm">
                <input type="hidden" name="produto_uso_id" value={escolhido.id} />
                <strong className="truncate">{escolhido.nome}</strong>
                <button type="button" onClick={() => setEscolhido(null)} aria-label="Trocar produto"
                  className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro"><X size={16} /></button>
              </span>
            ) : (
              <BuscaItem rotulo="Buscar produto de uso" placeholder="Número da cor (ex.: 7.1) ou oxidante…" opcoes={produtos}
                aoEscolher={(id) => setEscolhido(produtos.find((p) => p.id === id) ?? null)} />
            )}
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">Quantidade</span>
              <input name="quantidade" inputMode="decimal" required placeholder="30" className={`${classeInput} text-right`} />
              <span className="text-suave">{escolhido?.unidade ?? "g"}</span>
            </label>
            <BotaoEnviar variante="secundario" pendente="…">Adicionar</BotaoEnviar>
          </FormAcao>
          {podeRepetir && linhas.length === 0 && (
            <FormAcao acao={repetirFormula}>
              <input type="hidden" name="comanda_id" value={comandaId} /><input type="hidden" name="item_id" value={itemId} />
              <BotaoEnviar variante="fantasma" pendente="Repetindo…" className="px-2"><History size={16} aria-hidden /> Repetir última fórmula</BotaoEnviar>
            </FormAcao>
          )}
        </div>
      )}
    </div>
  );
}
