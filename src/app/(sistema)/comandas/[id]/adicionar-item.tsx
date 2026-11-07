"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search, X } from "lucide-react";
import { MensagemErro, useEnvioSemLimpar } from "@/components/formulario";
import { classeBotao, classeInput } from "@/components/ui";
import { formatarDuracao, formatarReais, semAcento } from "@/lib/formato";
import { lancarItem } from "../actions";

export type OpcaoItem = { id: string; nome: string; grupo: string; preco_centavos: number; duracao_min?: number; categoria_id: string };
type Tipo = "servico" | "produto";

const NOMES: Record<Tipo, string> = { servico: "serviço", produto: "produto" };

/**
 * Botões "+ Serviço" e "+ Produto": abrem a janela de seleção com busca por parte do nome
 * (sem acento também funciona). Ao escolher, o item entra na comanda com o preço atual da tabela.
 */
export function AdicionarItem({ comandaId, servicos, produtos, profissionais, podeEscolherProf, profPadrao, bloqueios }: {
  comandaId: string;
  servicos: OpcaoItem[];
  produtos: OpcaoItem[];
  profissionais: { id: string; nome: string }[];
  podeEscolherProf: boolean;
  profPadrao: string;
  /** Categorias que cada profissional não pode lançar */
  bloqueios: Record<string, string[]>;
}) {
  const { estado, aoEnviar, pendente } = useEnvioSemLimpar(lancarItem);
  const [tipo, setTipo] = useState<Tipo>("servico");
  const [termo, setTermo] = useState("");
  const janela = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const busca = useRef<HTMLInputElement>(null);
  const quantidade = useRef<HTMLInputElement>(null);
  const [profissional, setProfissional] = useState(profPadrao);
  const todasOpcoes = tipo === "servico" ? servicos : produtos;
  const opcoes = useMemo(() => {
    const bloqueadas = bloqueios[profissional] ?? [];
    return todasOpcoes.filter((o) => !bloqueadas.includes(o.categoria_id));
  }, [todasOpcoes, bloqueios, profissional]);

  const filtradas = useMemo(() => {
    const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
    return palavras.length
      ? opcoes.filter((o) => { const n = semAcento(o.nome); return palavras.every((p) => n.includes(p)); })
      : opcoes;
  }, [termo, opcoes]);

  const abrir = (t: Tipo) => {
    setTipo(t);
    setTermo("");
    if (quantidade.current) quantidade.current.value = "1";
    janela.current?.showModal();
    busca.current?.focus();
  };
  const fechar = () => janela.current?.close();

  // Enter na busca escolhe o primeiro da lista
  const teclado = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const primeiro = form.current?.querySelector<HTMLButtonElement>("button[name=item]");
    if (primeiro) form.current?.requestSubmit(primeiro);
  };

  return (
    <div className="flex flex-col gap-2">
      <MensagemErro erro={estado?.erro} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => abrir("servico")} disabled={pendente} className={classeBotao("secundario", "flex-1 sm:flex-none")}>
          <Plus size={16} aria-hidden /> Serviço
        </button>
        <button type="button" onClick={() => abrir("produto")} disabled={pendente} className={classeBotao("secundario", "flex-1 sm:flex-none")}>
          <Plus size={16} aria-hidden /> Produto
        </button>
        {pendente && <span className="flex min-h-11 items-center text-sm text-suave">Lançando…</span>}
      </div>

      <dialog ref={janela} aria-labelledby={`titulo-selecionar-${comandaId}`}
        className="m-auto max-h-[90dvh] w-[min(42rem,calc(100%-1rem))] rounded-xl border border-borda bg-cartao p-0 text-texto shadow-xl backdrop:bg-escuro/50">
        <form ref={form} onSubmit={(e) => { aoEnviar(e); fechar(); }} className="flex max-h-[90dvh] flex-col">
          <input type="hidden" name="comanda_id" value={comandaId} />
          <div className="flex items-center justify-between gap-2 border-b border-borda py-1 pr-1 pl-4">
            <h2 id={`titulo-selecionar-${comandaId}`} className="font-titulo text-2xl font-bold">Selecionar {NOMES[tipo]}</h2>
            <button type="button" onClick={fechar} aria-label="Fechar"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-suave hover:text-texto"><X size={20} /></button>
          </div>

          <div className="grid gap-2 border-b border-borda p-4 sm:grid-cols-[1fr_5rem]">
            <div className="relative sm:col-span-2">
              <Search size={18} className="pointer-events-none absolute top-3 left-3 text-suave" aria-hidden />
              <input ref={busca} value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={teclado} type="search"
                placeholder={`Digite parte do nome do ${NOMES[tipo]}…`} aria-label={`Buscar ${NOMES[tipo]}`} autoComplete="off"
                className={`${classeInput} pl-10`} />
            </div>
            {podeEscolherProf ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Profissional</span>
                <select name="profissional_id" required value={profissional} onChange={(e) => setProfissional(e.target.value)} className={classeInput}>
                  <option value="" disabled>Escolha…</option>
                  {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
            ) : <span className="hidden sm:block" />}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Qtd.</span>
              <input ref={quantidade} name="quantidade" type="number" min={1} defaultValue={1} required className={classeInput}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
            </label>
          </div>

          {opcoes.length < todasOpcoes.length && (
            <p className="border-b border-borda bg-fundo px-4 py-1 text-xs text-suave">Só aparecem os itens que esta profissional pode lançar.</p>
          )}
          <ul className="min-h-40 flex-1 overflow-y-auto" aria-label={`Lista de ${NOMES[tipo]}s`}>
            {opcoes.length === 0 && <li className="p-4 text-sm text-suave">{todasOpcoes.length === 0 ? `Nenhum ${NOMES[tipo]} cadastrado ainda (Serviços e produtos).` : `Esta profissional não pode lançar ${NOMES[tipo]}s.`}</li>}
            {opcoes.length > 0 && filtradas.length === 0 && <li className="p-4 text-sm text-suave">Nada encontrado para “{termo}”.</li>}
            {filtradas.map((o, i) => (
              <li key={o.id}>
                {(i === 0 || filtradas[i - 1].grupo !== o.grupo) && (
                  <p className="sticky top-0 bg-fundo px-4 py-1 text-xs font-semibold uppercase tracking-wide text-rose">{o.grupo}</p>
                )}
                <button name="item" value={`${tipo}:${o.id}`}
                  className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-borda px-4 py-2 text-left text-sm hover:bg-agendado-fundo focus:bg-agendado-fundo focus:outline-none">
                  <span className="min-w-0">
                    <span className="block font-medium">{o.nome}</span>
                    <span className="block text-xs text-suave">{o.grupo}{o.duracao_min ? ` · ${formatarDuracao(o.duracao_min)}` : ""}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatarReais(o.preco_centavos)}</span>
                </button>
              </li>
            ))}
          </ul>
        </form>
      </dialog>
    </div>
  );
}
