"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { BotaoEnviar, MensagemErro, useEnvioSemLimpar } from "@/components/formulario";
import { classeInput } from "@/components/ui";
import { BuscaItem } from "@/components/busca-item";
import { lancarItem } from "../actions";

type Opcao = { id: string; nome: string; grupo: string };

/** Formulário para lançar serviço ou produto na comanda. */
export function AdicionarItem({ comandaId, servicos, produtos, profissionais, podeEscolherProf, profPadrao }: {
  comandaId: string;
  servicos: Opcao[];
  produtos: Opcao[];
  profissionais: { id: string; nome: string }[];
  podeEscolherProf: boolean;
  profPadrao: string;
}) {
  const { estado, aoEnviar, pendente } = useEnvioSemLimpar(lancarItem);
  const [tipo, setTipo] = useState<"servico" | "produto">("servico");
  const [escolhido, setEscolhido] = useState<Opcao | null>(null);
  const opcoes = tipo === "servico" ? servicos : produtos;

  return (
    <form onSubmit={(e) => { aoEnviar(e); setEscolhido(null); }} className="flex flex-col gap-3 rounded-lg border border-dashed border-borda p-3">
      <MensagemErro erro={estado?.erro} />
      <input type="hidden" name="comanda_id" value={comandaId} />
      <div className="flex gap-1" role="radiogroup" aria-label="Tipo de item">
        {(["servico", "produto"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); setEscolhido(null); }}
            className={`min-h-11 flex-1 rounded-lg text-sm font-semibold sm:flex-none sm:px-5 ${tipo === t ? "bg-escuro text-sobre-escuro" : "border border-borda bg-cartao"}`}>
            {t === "servico" ? "Serviço" : "Produto"}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_5rem_12rem_auto] sm:items-end">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{tipo === "servico" ? "Serviço" : "Produto"}</span>
          {escolhido ? (
            <span className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-rose-claro bg-agendado-fundo/50 pl-3">
              <input type="hidden" name="item" value={`${tipo}:${escolhido.id}`} />
              <strong className="truncate">{escolhido.nome}</strong>
              <button type="button" onClick={() => setEscolhido(null)} aria-label="Trocar item"
                className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro"><X size={18} /></button>
            </span>
          ) : (
            <BuscaItem key={tipo} rotulo={tipo === "servico" ? "Buscar serviço" : "Buscar produto"}
              placeholder={tipo === "servico" ? "Digite o serviço…" : "Digite o produto…"}
              opcoes={opcoes} aoEscolher={(id) => setEscolhido(opcoes.find((o) => o.id === id) ?? null)} />
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Qtd.</span>
          <input name="quantidade" type="number" min={1} defaultValue={1} required className={classeInput} />
        </label>
        {podeEscolherProf ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Profissional</span>
            <select name="profissional_id" required defaultValue={profPadrao} className={classeInput}>
              <option value="" disabled>Escolha…</option>
              {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        ) : <span className="hidden sm:block" />}
        <BotaoEnviar pendenteExterno={pendente} pendente="Lançando…"><Plus size={16} aria-hidden /> Lançar</BotaoEnviar>
      </div>
      {tipo === "produto" && produtos.length === 0 && <p className="text-xs text-suave">Nenhum produto cadastrado ainda (Serviços e produtos → Produtos).</p>}
    </form>
  );
}
