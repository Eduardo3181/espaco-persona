"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { MensagemErro } from "@/components/formulario";
import { classeBotao, classeInput } from "@/components/ui";

const campoEstreito = classeInput.replace("w-full ", "");
import { centavosParaCampo, formatarReais, reaisParaCentavos } from "@/lib/formato";
import { fecharComanda, manterAberta } from "../actions";

export type ItemFechamento = {
  id: string;
  descricao: string;
  profissional_id: string;
  profissional_nome: string;
  total: number;
  comissao: number;        // prevista, em centavos
  percentual: number | null; // null = sem regra
};

type Forma = "pix" | "credito" | "debito" | "dinheiro" | "saldo";
const FORMAS: { id: Forma; rotulo: string }[] = [
  { id: "pix", rotulo: "Pix" },
  { id: "credito", rotulo: "Crédito" },
  { id: "debito", rotulo: "Débito" },
  { id: "dinheiro", rotulo: "Dinheiro" },
  { id: "saldo", rotulo: "Saldo na casa" },
];

type Linha = { forma: Forma; valor: string };

export function Fechamento({ comandaId, itens, profissionais, caixinhasIniciais, pagamentosIniciais, taxas, temCliente, saldoCliente }: {
  comandaId: string;
  itens: ItemFechamento[];
  profissionais: { id: string; nome: string }[];
  caixinhasIniciais: Record<string, number>;
  pagamentosIniciais: { forma: Forma; valor_centavos: number }[];
  taxas: Record<Forma, number>;
  temCliente: boolean;
  saldoCliente: number;
}) {
  const [estadoFechar, acaoFechar, fechando] = useActionState(fecharComanda, null);
  const [estadoManter, acaoManter, mantendo] = useActionState(manterAberta, null);
  const ocupado = fechando || mantendo;

  const [caixinhas, setCaixinhas] = useState<Record<string, string>>(() =>
    Object.fromEntries(profissionais.map((p) => [p.id, caixinhasIniciais[p.id] ? centavosParaCampo(caixinhasIniciais[p.id]) : ""])),
  );
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    pagamentosIniciais.length
      ? pagamentosIniciais.map((p) => ({ forma: p.forma, valor: centavosParaCampo(p.valor_centavos) }))
      : [{ forma: "pix", valor: "" }],
  );

  const totalItens = itens.reduce((t, i) => t + i.total, 0);
  const caixinhaCent = (id: string) => reaisParaCentavos(caixinhas[id] || "0") ?? 0;
  const totalCaixinhas = profissionais.reduce((t, p) => t + caixinhaCent(p.id), 0);
  const totalReceber = totalItens + totalCaixinhas;

  // A última linha recebe automaticamente o que falta
  const fixas = linhas.slice(0, -1).map((l) => reaisParaCentavos(l.valor || "0") ?? 0);
  const somaFixas = fixas.reduce((t, v) => t + v, 0);
  const restante = totalReceber - somaFixas;
  const valores = [...fixas, Math.max(restante, 0)];
  const taxaTotal = linhas.reduce((t, l, i) => t + Math.round((valores[i] * (taxas[l.forma] ?? 0)) / 100), 0);
  const comissoes = itens.reduce((t, i) => t + i.comissao, 0);
  const semRegra = itens.filter((i) => i.percentual === null);
  const usaSaldo = linhas.some((l, i) => l.forma === "saldo" && valores[i] > 0);
  const valorSaldo = linhas.reduce((t, l, i) => t + (l.forma === "saldo" ? valores[i] : 0), 0);

  const somarCaixinha = (id: string, mais: number) =>
    setCaixinhas({ ...caixinhas, [id]: centavosParaCampo(caixinhaCent(id) + mais) });

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const quem = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    const dados = new FormData();
    dados.set("comanda_id", comandaId);
    dados.set("caixinhas", JSON.stringify(profissionais.map((p) => ({ profissional_id: p.id, valor_centavos: caixinhaCent(p.id) })).filter((c) => c.valor_centavos > 0)));
    dados.set("pagamentos", JSON.stringify(linhas.map((l, i) => ({ forma: l.forma, valor_centavos: valores[i] })).filter((p) => p.valor_centavos > 0)));
    startTransition(() => (quem === "fechar" ? acaoFechar(dados) : acaoManter(dados)));
  };

  // Por profissional: comissão + caixinha
  const porProf = profissionais.map((p) => {
    const com = itens.filter((i) => i.profissional_id === p.id).reduce((t, i) => t + i.comissao, 0);
    return { ...p, com, cx: caixinhaCent(p.id) };
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <MensagemErro erro={estadoFechar?.erro ?? estadoManter?.erro} />

      {/* Caixinha */}
      <section>
        <h3 className="mb-1 font-semibold">Caixinha</h3>
        <p className="mb-2 text-xs text-suave">Vai 100% para a profissional. Não gera comissão e não entra no faturamento.</p>
        <div className="flex flex-col gap-2">
          {profissionais.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="w-28 truncate text-sm font-medium">{p.nome.split(" ")[0]}</span>
              <input value={caixinhas[p.id]} onChange={(e) => setCaixinhas({ ...caixinhas, [p.id]: e.target.value })}
                inputMode="decimal" placeholder="0,00" aria-label={`Caixinha de ${p.nome}`} className={`${campoEstreito} w-28`} />
              <button type="button" onClick={() => somarCaixinha(p.id, 1000)} className={classeBotao("secundario", "px-3")}>+R$ 10</button>
              <button type="button" onClick={() => somarCaixinha(p.id, 2000)} className={classeBotao("secundario", "px-3")}>+R$ 20</button>
            </div>
          ))}
        </div>
      </section>

      {/* Pagamento */}
      <section>
        <h3 className="mb-2 font-semibold">Pagamento</h3>
        <div className="flex flex-col gap-2">
          {linhas.map((l, i) => {
            const ultima = i === linhas.length - 1;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={l.forma} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, forma: e.target.value as Forma } : x)))}
                  aria-label={`Forma de pagamento ${i + 1}`} className={`${campoEstreito} w-40`}>
                  {FORMAS.filter((f) => f.id !== "saldo" || temCliente).map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
                </select>
                {ultima ? (
                  <span className="flex min-h-11 w-32 items-center rounded-lg border border-borda bg-fundo px-3 text-sm font-semibold" aria-label="Valor restante">
                    {formatarReais(Math.max(restante, 0))}
                  </span>
                ) : (
                  <input value={l.valor} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                    inputMode="decimal" placeholder="0,00" aria-label={`Valor ${i + 1}`} className={`${campoEstreito} w-32`} />
                )}
                {(taxas[l.forma] ?? 0) > 0 && valores[i] > 0 && (
                  <span className="text-xs text-suave">taxa {formatarReais(Math.round((valores[i] * taxas[l.forma]) / 100))}</span>
                )}
                {linhas.length > 1 && (
                  <button type="button" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro" aria-label="Remover forma de pagamento">
                    <X size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className={classeBotao("fantasma", "mt-1 px-2")}
          onClick={() => {
            // a última linha "congela" o valor que estava calculado, e a nova passa a receber o restante
            const congeladas = linhas.map((l, i) => (i === linhas.length - 1 ? { ...l, valor: centavosParaCampo(Math.max(restante, 0)) } : l));
            setLinhas([...congeladas, { forma: "credito", valor: "" }]);
          }}>
          <Plus size={16} aria-hidden /> Dividir pagamento
        </button>
        {restante < 0 && <p className="mt-1 text-sm font-semibold text-erro">Os valores passam do total em {formatarReais(-restante)}.</p>}
        {usaSaldo && (
          <p className="mt-1 text-xs text-suave">
            Saldo atual da cliente: {formatarReais(saldoCliente)} → depois: {formatarReais(saldoCliente - valorSaldo)}
            {saldoCliente - valorSaldo < 0 && " (fica devendo)"}
          </p>
        )}
      </section>

      {/* Resumo */}
      <section className="rounded-lg bg-fundo p-4 text-sm">
        <dl className="grid grid-cols-[1fr_auto] gap-y-1">
          <dt>Itens</dt><dd className="text-right">{formatarReais(totalItens)}</dd>
          <dt>Caixinhas</dt><dd className="text-right">{formatarReais(totalCaixinhas)}</dd>
          <dt className="text-suave">Taxa da maquininha (estimada)</dt><dd className="text-right text-suave">− {formatarReais(taxaTotal)}</dd>
          <dt className="text-suave">Comissões geradas</dt><dd className="text-right text-suave">{formatarReais(comissoes)}</dd>
          <dt className="mt-2 border-t border-borda pt-2 text-base font-bold">Total a receber</dt>
          <dd className="mt-2 border-t border-borda pt-2 text-right text-base font-bold">{formatarReais(totalReceber)}</dd>
        </dl>
        <div className="mt-3 border-t border-borda pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Cada profissional recebe</p>
          <ul className="flex flex-col gap-1">
            {porProf.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.nome.split(" ")[0]}</span>
                <span>{formatarReais(p.com)} + {formatarReais(p.cx)} = <strong>{formatarReais(p.com + p.cx)}</strong></span>
              </li>
            ))}
          </ul>
        </div>
        {semRegra.length > 0 && (
          <p className="mt-3 flex gap-2 rounded-lg bg-aguardando-fundo p-2 text-xs text-aguardando">
            <AlertTriangle size={16} className="shrink-0" aria-hidden />
            Sem regra de comissão: {semRegra.map((i) => `${i.descricao} (${i.profissional_nome.split(" ")[0]})`).join(", ")}. Esses itens vão gerar comissão de 0%.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="submit" value="fechar" disabled={ocupado || restante < 0 || itens.length === 0} className={classeBotao("primario", "flex-1 sm:flex-none")}>
          {fechando ? "Fechando…" : "Fechar comanda"}
        </button>
        <button type="submit" value="manter" disabled={ocupado} className={classeBotao("secundario")}>
          {mantendo ? "Salvando…" : "Manter aberta"}
        </button>
      </div>
    </form>
  );
}
