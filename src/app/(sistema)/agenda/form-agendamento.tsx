"use client";

import { useEffect, useMemo, useState } from "react";
import { BotaoEnviar, MensagemErro, useEnvioSemLimpar } from "@/components/formulario";
import { Search, UserPlus, X } from "lucide-react";
import { classeBotao, classeInput } from "@/components/ui";
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
  const [escolhidos, setEscolhidos] = useState<string[]>(inicial.servicos);
  const [duracaoManual, setDuracaoManual] = useState<number | null>(inicial.duracao ?? null);

  const porId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos]);
  const somaServicos = escolhidos.reduce((t, id) => t + (porId.get(id)?.duracao_min ?? 0), 0);
  const duracao = duracaoManual ?? somaServicos;
  const categorias = useMemo(() => [...new Set(servicos.map((s) => s.categoria))], [servicos]);

  // Busca de clientes enquanto digita
  useEffect(() => {
    if (cliente || novoCliente || termo.trim().length < 2) return;
    const t = setTimeout(async () => setResultados(await buscarClientes(termo)), 250);
    return () => clearTimeout(t);
  }, [termo, cliente, novoCliente]);

  return (
    <form onSubmit={aoEnviar} className="grid gap-5 sm:grid-cols-2">
      <MensagemErro erro={estado?.erro} />
      <input type="hidden" name="id" value={inicial.id ?? ""} />

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

      {/* Profissional */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Profissional</span>
        {podeEscolherProf ? (
          <select name="profissional_id" required defaultValue={inicial.profissional_id} className={classeInput}>
            <option value="" disabled>Escolha…</option>
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        ) : (
          <>
            <input type="hidden" name="profissional_id" value={inicial.profissional_id} />
            <span className="flex min-h-11 items-center rounded-lg border border-borda bg-fundo px-3">{profissionais[0]?.nome}</span>
          </>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Data</span>
          <input name="data" type="date" required defaultValue={inicial.data} className={classeInput} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hora</span>
          <input name="hora" type="time" required step={300} defaultValue={inicial.hora} className={classeInput} />
        </label>
      </div>

      {/* Serviços */}
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Serviços</legend>
        {escolhidos.length > 0 && (
          <ul className="mb-2 flex flex-col gap-1">
            {escolhidos.map((id, i) => (
              <li key={`${id}-${i}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-borda bg-fundo/50 pl-3">
                <input type="hidden" name="servico" value={id} />
                <span className="text-sm">{porId.get(id)?.nome ?? "Serviço"} <span className="text-suave">· {formatarDuracao(porId.get(id)?.duracao_min ?? 0)}</span></span>
                <button type="button" onClick={() => setEscolhidos(escolhidos.filter((_, j) => j !== i))}
                  className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro" aria-label={`Remover ${porId.get(id)?.nome}`}>
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <select value="" onChange={(e) => { if (e.target.value) setEscolhidos([...escolhidos, e.target.value]); }}
          aria-label="Adicionar serviço" className={classeInput}>
          <option value="">{escolhidos.length ? "+ Adicionar outro serviço…" : "Escolha o serviço…"}</option>
          {categorias.map((cat) => (
            <optgroup key={cat} label={cat}>
              {servicos.filter((s) => s.categoria === cat).map((s) => (
                <option key={s.id} value={s.id}>{s.nome} ({formatarDuracao(s.duracao_min)})</option>
              ))}
            </optgroup>
          ))}
        </select>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Duração total (minutos)</span>
        <input name="duracao" type="number" min={5} max={720} step={5} required value={duracao || ""}
          onChange={(e) => setDuracaoManual(e.target.value ? Number(e.target.value) : null)} className={classeInput} />
        <span className="text-xs text-suave">
          {duracaoManual !== null && duracaoManual !== somaServicos ? (
            <>Ajustada à mão (soma dos serviços: {formatarDuracao(somaServicos)}).{" "}
              <button type="button" className="font-semibold text-rose" onClick={() => setDuracaoManual(null)}>Usar a soma</button></>
          ) : "Soma dos serviços — pode ajustar."}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Observação (opcional)</span>
        <input name="observacao" defaultValue={inicial.observacao ?? ""} className={classeInput} />
      </label>

      <div className="flex gap-3 sm:col-span-2">
        <BotaoEnviar pendenteExterno={pendente}>Salvar agendamento</BotaoEnviar>
        <a href={voltarHref} className={classeBotao("secundario")}>Cancelar</a>
      </div>
    </form>
  );
}

