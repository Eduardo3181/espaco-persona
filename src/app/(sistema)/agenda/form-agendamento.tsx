"use client";

import { useEffect, useMemo, useState } from "react";
import { BotaoEnviar, MensagemErro, useEnvioSemLimpar } from "@/components/formulario";
import { Link2, Plus, Search, UserPlus, X } from "lucide-react";
import { classeBotao, classeInput } from "@/components/ui";
import { BuscaItem, type OpcaoBusca } from "@/components/busca-item";
import { formatarDuracao, formatarTelefone } from "@/lib/formato";
import { buscarClientes, salvarAgendamento } from "./actions";

type Servico = { id: string; nome: string; duracao_min: number; categoria: string };
type ClienteResumo = { id: string; nome: string; telefone: string | null };

export type InicialAgendamento = {
  id?: string;
  profissional_id: string;
  cliente: ClienteResumo | null;
  data: string;
  hora: string;
  servicos: string[];
  duracao?: number;
  observacao?: string;
};

/** Parte do atendimento feita por uma profissional (com hora e serviços próprios). */
type Bloco = { chave: number; profissional_id: string; hora: string; servicos: string[]; duracaoManual: number | null };

export function FormAgendamento({ profissionais, podeEscolherProf, servicos, inicial, voltarHref }: {
  profissionais: { id: string; nome: string }[];
  podeEscolherProf: boolean;
  servicos: Servico[];
  inicial: InicialAgendamento;
  voltarHref: string;
}) {
  const { estado, aoEnviar, pendente } = useEnvioSemLimpar(salvarAgendamento);
  const [cliente, setCliente] = useState<ClienteResumo | null>(inicial.cliente);
  const [novoCliente, setNovoCliente] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([
    { chave: 0, profissional_id: inicial.profissional_id, hora: inicial.hora, servicos: inicial.servicos, duracaoManual: inicial.duracao ?? null },
  ]);

  const editando = Boolean(inicial.id);
  const podeVarias = podeEscolherProf && !editando;
  const porId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos]);
  const opcoesServico = useMemo<OpcaoBusca[]>(
    () => servicos.map((s) => ({ id: s.id, nome: s.nome, grupo: s.categoria, detalhe: formatarDuracao(s.duracao_min) })),
    [servicos],
  );
  const soma = (b: Bloco) => b.servicos.reduce((t, id) => t + (porId.get(id)?.duracao_min ?? 0), 0);
  const duracaoDe = (b: Bloco) => b.duracaoManual ?? soma(b);

  const alterar = (chave: number, mudanca: Partial<Bloco>) =>
    setBlocos((atual) => atual.map((b) => (b.chave === chave ? { ...b, ...mudanca } : b)));

  const adicionarProfissional = () => {
    const usadas = new Set(blocos.map((b) => b.profissional_id));
    const proxima = profissionais.find((p) => !usadas.has(p.id))?.id ?? "";
    setBlocos((atual) => [
      ...atual,
      { chave: Math.max(...atual.map((b) => b.chave)) + 1, profissional_id: proxima, hora: atual[0].hora, servicos: [], duracaoManual: null },
    ]);
  };

  // Busca de clientes enquanto digita
  useEffect(() => {
    if (cliente || novoCliente || termo.trim().length < 2) return;
    const t = setTimeout(async () => setResultados(await buscarClientes(termo)), 250);
    return () => clearTimeout(t);
  }, [termo, cliente, novoCliente]);

  const blocosJson = JSON.stringify(blocos.map((b) => ({
    profissional_id: b.profissional_id, hora: b.hora, servicos: b.servicos, duracao: duracaoDe(b),
  })));

  return (
    <form onSubmit={aoEnviar} className="grid gap-5 sm:grid-cols-2">
      <MensagemErro erro={estado?.erro} />
      <input type="hidden" name="id" value={inicial.id ?? ""} />
      <input type="hidden" name="blocos" value={blocosJson} />

      {/* Cliente */}
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Cliente</legend>
        {cliente ? (
          <div key="escolhida" className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-rose-claro bg-agendado-fundo/50 px-3">
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <span className="text-sm">
              <strong>{cliente.nome}</strong>
              {cliente.telefone && <span className="text-suave"> · {formatarTelefone(cliente.telefone)}</span>}
            </span>
            <button type="button" onClick={() => { setCliente(null); setTermo(""); setResultados([]); }}
              className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro" aria-label="Trocar cliente">
              <X size={18} />
            </button>
          </div>
        ) : novoCliente ? (
          <div key="nova" className="grid gap-2 rounded-lg border border-borda p-3 sm:grid-cols-2">
            <input name="novo_cliente_nome" required defaultValue={termo} placeholder="Nome da nova cliente" aria-label="Nome da nova cliente" className={classeInput} />
            <input name="novo_cliente_telefone" type="tel" placeholder="Telefone (opcional)" aria-label="Telefone da nova cliente" className={classeInput} />
            <button type="button" onClick={() => setNovoCliente(false)} className="text-left text-sm font-semibold text-rose sm:col-span-2">
              ← Buscar cliente já cadastrada
            </button>
          </div>
        ) : (
          <div key="busca" className="relative">
            <Search size={18} className="pointer-events-none absolute top-3 left-3 text-suave" aria-hidden />
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Digite o nome ou telefone…"
              aria-label="Buscar cliente" autoComplete="off" className={`${classeInput} pl-10`} />
            {termo.trim().length >= 2 && (
              <ul className="mt-1 overflow-hidden rounded-lg border border-borda bg-cartao shadow-lg">
                {resultados.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCliente(c)} className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-fundo">
                      {c.nome}{c.telefone && <span className="ml-2 text-suave">{formatarTelefone(c.telefone)}</span>}
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={() => setNovoCliente(true)}
                    className="flex min-h-11 w-full items-center gap-2 border-t border-borda px-3 text-left text-sm font-semibold text-rose hover:bg-fundo">
                    <UserPlus size={16} aria-hidden /> Cadastrar “{termo.trim()}” como nova cliente
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Data</span>
        <input name="data" type="date" required defaultValue={inicial.data} className={classeInput} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Observação (opcional)</span>
        <input name="observacao" defaultValue={inicial.observacao ?? ""} className={classeInput} />
      </label>

      {/* Uma parte por profissional */}
      <div className="flex flex-col gap-4 sm:col-span-2">
        {blocos.length > 1 && (
          <p className="flex items-center gap-2 text-sm text-atendimento">
            <Link2 size={16} aria-hidden /> Atendimento com {blocos.length} profissionais: cada uma aparece na própria coluna e a comanda será uma só.
          </p>
        )}
        {blocos.map((b, i) => {
          const somaB = soma(b);
          const duracao = duracaoDe(b);
          return (
            <fieldset key={b.chave} className={`grid gap-4 rounded-xl border p-4 sm:grid-cols-2 ${blocos.length > 1 ? "border-rose-claro" : "border-borda"}`}>
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                {blocos.length > 1 ? `Profissional ${i + 1}` : "Profissional e serviços"}
                {i > 0 && (
                  <button type="button" onClick={() => setBlocos(blocos.filter((x) => x.chave !== b.chave))}
                    className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-erro hover:bg-fundo">
                    <X size={14} aria-hidden /> Remover
                  </button>
                )}
              </legend>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Profissional</span>
                {podeEscolherProf ? (
                  <select required value={b.profissional_id} onChange={(e) => alterar(b.chave, { profissional_id: e.target.value })} className={classeInput}>
                    <option value="" disabled>Escolha…</option>
                    {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                ) : (
                  <span className="flex min-h-11 items-center rounded-lg border border-borda bg-fundo px-3">{profissionais[0]?.nome}</span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Hora</span>
                <input type="time" required step={300} value={b.hora} onChange={(e) => alterar(b.chave, { hora: e.target.value })} className={classeInput} />
              </label>

              <div className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Serviços</span>
                {b.servicos.length > 0 && (
                  <ul className="mb-1 flex flex-col gap-1">
                    {b.servicos.map((id, j) => (
                      <li key={`${id}-${j}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-borda bg-fundo/50 pl-3">
                        <span>{porId.get(id)?.nome ?? "Serviço"} <span className="text-suave">· {formatarDuracao(porId.get(id)?.duracao_min ?? 0)}</span></span>
                        <button type="button" onClick={() => alterar(b.chave, { servicos: b.servicos.filter((_, k) => k !== j) })}
                          className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro" aria-label={`Remover ${porId.get(id)?.nome}`}>
                          <X size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <BuscaItem
                  rotulo={`Adicionar serviço${blocos.length > 1 ? ` da profissional ${i + 1}` : ""}`}
                  placeholder={b.servicos.length ? "Adicionar outro serviço — digite para buscar…" : "Digite o serviço (ex.: escova, corte, mão)…"}
                  opcoes={opcoesServico}
                  aoEscolher={(id) => alterar(b.chave, { servicos: [...b.servicos, id] })}
                />
              </div>

              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Duração (minutos)</span>
                <input type="number" min={5} max={720} step={5} required value={duracao || ""}
                  onChange={(e) => alterar(b.chave, { duracaoManual: e.target.value ? Number(e.target.value) : null })}
                  className={`${classeInput.replace("w-full ", "")} w-32`} />
                <span className="text-xs text-suave">
                  {b.duracaoManual !== null && b.duracaoManual !== somaB ? (
                    <>Ajustada à mão (soma dos serviços: {formatarDuracao(somaB)}).{" "}
                      <button type="button" className="font-semibold text-rose" onClick={() => alterar(b.chave, { duracaoManual: null })}>Usar a soma</button></>
                  ) : "Soma dos serviços — pode ajustar."}
                </span>
              </label>
            </fieldset>
          );
        })}

        {podeVarias && blocos.length < profissionais.length && (
          <button type="button" onClick={adicionarProfissional} className={classeBotao("secundario", "self-start")}>
            <Plus size={16} aria-hidden /> Adicionar outra profissional
          </button>
        )}
      </div>

      <div className="flex gap-3 sm:col-span-2">
        <BotaoEnviar pendenteExterno={pendente}>Salvar agendamento</BotaoEnviar>
        <a href={voltarHref} className={classeBotao("secundario")}>Cancelar</a>
      </div>
    </form>
  );
}
