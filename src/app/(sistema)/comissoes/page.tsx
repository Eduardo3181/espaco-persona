import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Abas, Campo, Cartao, Vazio, classeInput } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import {
  FORMAS_PAGAMENTO_COMISSAO, periodoAnterior, periodoDaChave, periodoDaData, periodoSeguinte, type Periodo,
} from "@/lib/periodo";
import { obterConfigEquipe } from "@/lib/config";
import type { DiasPagamento } from "@/lib/periodo";
import { desfazerPagamento, registrarPagamento } from "./actions";

export const metadata: Metadata = { title: "Comissões" };

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

type LinhaExtrato = {
  id: string; data: string; tipo: "comissao" | "caixinha" | "vale" | "ajuste"; descricao: string; valor_centavos: number;
  cliente_nome: string | null; comanda_numero: number | null; pagamento_id?: string | null; data_pagamento?: string | null;
};

const somar = (l: LinhaExtrato[], tipo?: string) => l.filter((x) => !tipo || x.tipo === tipo).reduce((t, x) => t + x.valor_centavos, 0);
const ddmm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

export default async function PaginaComissoes({ searchParams }: PageProps<"/comissoes">) {
  const { profissional: eu } = await exigirEquipe();
  const sp = await searchParams;
  const { dias } = await obterConfigEquipe();
  const periodo = periodoDaChave(sp.p, dias) ?? periodoDaData(hojeISO(), dias);
  const supabase = await criarClienteServidor();

  if (eu.papel !== "dono") return <VisaoProfissional supabase={supabase} euId={eu.id} periodo={periodo} dias={dias} />;

  const aba = sp.aba === "pagas" ? "pagas" : "apagar";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Abas atual={aba} abas={[
        { id: "apagar", rotulo: "A pagar", href: `/comissoes?p=${periodo.chave}` },
        { id: "pagas", rotulo: "Pagas", href: "/comissoes?aba=pagas" },
      ]} />
      {aba === "apagar"
        ? <APagar supabase={supabase} periodo={periodo} dias={dias} acabouDePagar={sp.pago === "1"} />
        : <Pagas supabase={supabase} ver={typeof sp.ver === "string" ? sp.ver : undefined} />}
    </div>
  );
}

// ======================================================================
// Peças comuns
// ======================================================================

function SeletorPeriodo({ periodo, dias, extra = "" }: { periodo: Periodo; dias: DiasPagamento; extra?: string }) {
  const atual = periodoDaData(hojeISO(), dias).chave === periodo.chave;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/comissoes?p=${periodoAnterior(periodo, dias).chave}${extra}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Período anterior">
        <ChevronLeft size={20} />
      </Link>
      <Link href={`/comissoes?p=${periodoSeguinte(periodo, dias).chave}${extra}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Próximo período">
        <ChevronRight size={20} />
      </Link>
      <div>
        <h2 className="font-titulo text-2xl font-bold">{periodo.rotulo}</h2>
        <p className="text-xs text-suave">Pagamento em {formatarDiaISO(periodo.pagamento)}{atual && " · período atual"}</p>
      </div>
      {!atual && (
        <Link href={`/comissoes${extra ? `?${extra.slice(1)}` : ""}`} className="ml-auto flex min-h-11 items-center rounded-lg border border-borda bg-cartao px-4 text-sm font-semibold">Período atual</Link>
      )}
    </div>
  );
}

function TabelaExtrato({ linhas, mostrarPago = false }: { linhas: LinhaExtrato[]; mostrarPago?: boolean }) {
  if (linhas.length === 0) return <p className="text-sm text-suave">Nenhum lançamento.</p>;
  return (
    <ul className="divide-y divide-borda text-sm">
      {linhas.map((l) => (
        <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <span className="w-12 shrink-0 text-suave">{ddmm(l.data)}</span>
          <span className="min-w-0 flex-1">
            {l.cliente_nome && <strong>{l.cliente_nome} · </strong>}
            {l.tipo === "caixinha" ? "Caixinha" : l.descricao.replace(/ — comanda #\d+$/, "")}
            {mostrarPago && l.pagamento_id && <span className="ml-2 text-xs text-sucesso">pago {l.data_pagamento && ddmm(l.data_pagamento)}</span>}
          </span>
          <span className={`font-semibold ${l.tipo === "caixinha" ? "text-atendimento" : ""}`}>{formatarReais(l.valor_centavos)}</span>
        </li>
      ))}
    </ul>
  );
}

async function extrato(supabase: Supabase, profId: string, p: Periodo) {
  const { data } = await supabase.rpc("extrato_profissional", { p_profissional_id: profId, p_inicio: p.inicio, p_fim: p.fim });
  return (data ?? []) as LinhaExtrato[];
}

// ======================================================================
// DONO: A pagar
// ======================================================================

async function APagar({ supabase, periodo, dias, acabouDePagar }: { supabase: Supabase; periodo: Periodo; dias: DiasPagamento; acabouDePagar: boolean }) {
  const [{ data: profs }, { data: antigos }] = await Promise.all([
    supabase.from("profissionais").select("id, nome, cor, ativo").order("nome"),
    supabase.from("lancamentos_profissional").select("data").is("pagamento_id", null).lt("data", periodo.inicio),
  ]);
  const extratos = await Promise.all((profs ?? []).map(async (p) => ({ ...p, linhas: await extrato(supabase, p.id, periodo) })));
  const comMovimento = extratos.filter((p) => p.linhas.length > 0);
  const semMovimento = extratos.filter((p) => p.linhas.length === 0 && p.ativo);

  // Períodos anteriores ainda sem baixa
  const pendentesAntes = [...new Map((antigos ?? []).map((l) => {
    const per = periodoDaData(l.data, dias);
    return [per.chave, per] as const;
  })).values()].sort((a, b) => a.inicio.localeCompare(b.inicio));

  return (
    <>
      <SeletorPeriodo periodo={periodo} dias={dias} />

      {acabouDePagar && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-sucesso/30 bg-[#E3EFE5] px-3 py-2 text-sm font-semibold text-sucesso">
          <CheckCircle2 size={18} aria-hidden /> Pagamento registrado.
        </p>
      )}
      {pendentesAntes.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-aguardando-fundo px-3 py-2 text-sm text-aguardando">
          <AlertTriangle size={16} aria-hidden /> Períodos anteriores ainda sem baixa:
          {pendentesAntes.map((p) => <Link key={p.chave} href={`/comissoes?p=${p.chave}`} className="font-semibold underline">{p.rotulo}</Link>)}
        </p>
      )}

      {comMovimento.length === 0 ? (
        <Vazio>Nenhuma comissão ou caixinha neste período.</Vazio>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {comMovimento.map((p) => {
            const pendentes = p.linhas.filter((l) => !l.pagamento_id);
            const pagas = p.linhas.filter((l) => l.pagamento_id);
            const com = somar(pendentes, "comissao");
            const cx = somar(pendentes, "caixinha");
            return (
              <Cartao key={p.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: p.cor }} aria-hidden />
                  <h3 className="text-lg font-semibold">{p.nome}</h3>
                </div>
                {pendentes.length > 0 ? (
                  <>
                    <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                      <dt>Comissões</dt><dd className="text-right">{formatarReais(com)}</dd>
                      <dt>Caixinhas</dt><dd className="text-right">+ {formatarReais(cx)}</dd>
                      <dt className="border-t border-borda pt-1 text-base font-bold">Total a receber</dt>
                      <dd className="border-t border-borda pt-1 text-right text-base font-bold">{formatarReais(com + cx)}</dd>
                    </dl>
                    <details className="rounded-lg bg-fundo p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-rose">Ver extrato ({pendentes.length})</summary>
                      <div className="mt-2"><TabelaExtrato linhas={pendentes} /></div>
                    </details>
                    <FormAcao acao={registrarPagamento} className="grid gap-2 border-t border-borda pt-3 sm:grid-cols-2">
                      <input type="hidden" name="profissional_id" value={p.id} />
                      <input type="hidden" name="periodo" value={periodo.chave} />
                      <Campo rotulo="Data do pagamento">
                        <input name="data_pagamento" type="date" required defaultValue={periodo.pagamento} className={classeInput} />
                      </Campo>
                      <Campo rotulo="Forma">
                        <select name="forma" defaultValue="pix" className={classeInput}>
                          {Object.entries(FORMAS_PAGAMENTO_COMISSAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                        </select>
                      </Campo>
                      <Campo rotulo="Observação (opcional)" className="sm:col-span-2">
                        <input name="observacao" className={classeInput} />
                      </Campo>
                      <div className="sm:col-span-2">
                        <BotaoEnviar pendente="Registrando…" confirmar={`Registrar pagamento de ${formatarReais(com + cx)} para ${p.nome}?`}>
                          Registrar pagamento de {formatarReais(com + cx)}
                        </BotaoEnviar>
                      </div>
                    </FormAcao>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-sm font-semibold text-sucesso">
                    <CheckCircle2 size={16} aria-hidden /> Período pago ({formatarReais(somar(pagas))})
                  </p>
                )}
              </Cartao>
            );
          })}
        </div>
      )}
      {semMovimento.length > 0 && comMovimento.length > 0 && (
        <p className="text-xs text-suave">Sem movimento neste período: {semMovimento.map((p) => p.nome).join(", ")}.</p>
      )}
    </>
  );
}

// ======================================================================
// DONO: Pagas
// ======================================================================

async function Pagas({ supabase, ver }: { supabase: Supabase; ver?: string }) {
  const { data } = await supabase
    .from("pagamentos_profissional")
    .select("id, periodo_inicio, periodo_fim, data_pagamento, forma, total_comissoes_centavos, total_caixinhas_centavos, total_pago_centavos, observacao, profissionais!pagamentos_profissional_profissional_id_fkey(nome)")
    .order("data_pagamento", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(60);
  type Pag = {
    id: string; periodo_inicio: string; periodo_fim: string; data_pagamento: string; forma: string;
    total_comissoes_centavos: number; total_caixinhas_centavos: number; total_pago_centavos: number; observacao: string | null;
    profissionais: { nome: string } | null;
  };
  const pagamentos = (data ?? []) as unknown as Pag[];
  let detalhe: LinhaExtrato[] = [];
  if (ver) {
    const { data: d } = await supabase.rpc("extrato_pagamento", { p_pagamento_id: ver });
    detalhe = (d ?? []) as LinhaExtrato[];
  }

  if (pagamentos.length === 0) return <Vazio>Nenhum pagamento registrado ainda.</Vazio>;
  return (
    <ul className="flex flex-col gap-3">
      {pagamentos.map((p) => (
        <li key={p.id}>
          <Cartao className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{p.profissionais?.nome}</p>
              <p className="text-lg font-bold">{formatarReais(p.total_pago_centavos)}</p>
            </div>
            <p className="text-sm text-suave">
              Período {formatarDiaISO(p.periodo_inicio)} a {formatarDiaISO(p.periodo_fim)} · pago em {formatarDiaISO(p.data_pagamento)} ({FORMAS_PAGAMENTO_COMISSAO[p.forma]})
              {" · "}comissões {formatarReais(p.total_comissoes_centavos)} + caixinhas {formatarReais(p.total_caixinhas_centavos)}
              {p.observacao && ` · ${p.observacao}`}
            </p>
            {ver === p.id ? (
              <div className="rounded-lg bg-fundo p-3">
                <TabelaExtrato linhas={detalhe} />
                <FormAcao acao={desfazerPagamento} className="mt-3 border-t border-borda pt-3">
                  <input type="hidden" name="pagamento_id" value={p.id} />
                  <BotaoEnviar variante="perigo" pendente="Desfazendo…" confirmar="Desfazer este pagamento? Os lançamentos voltam para 'A pagar'.">
                    Desfazer pagamento (lançado por engano)
                  </BotaoEnviar>
                </FormAcao>
              </div>
            ) : (
              <Link href={`/comissoes?aba=pagas&ver=${p.id}`} className="self-start text-sm font-semibold text-rose">Ver extrato</Link>
            )}
          </Cartao>
        </li>
      ))}
    </ul>
  );
}

// ======================================================================
// PROFISSIONAL: os próprios valores
// ======================================================================

async function VisaoProfissional({ supabase, euId, periodo, dias }: { supabase: Supabase; euId: string; periodo: Periodo; dias: DiasPagamento }) {
  const [linhas, { data: pags }] = await Promise.all([
    extrato(supabase, euId, periodo),
    supabase.from("pagamentos_profissional").select("id, periodo_inicio, periodo_fim, data_pagamento, total_pago_centavos").order("data_pagamento", { ascending: false }).limit(12),
  ]);
  const pendentes = linhas.filter((l) => !l.pagamento_id);
  const recebe = somar(pendentes);
  const tudoPago = linhas.length > 0 && pendentes.length === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <SeletorPeriodo periodo={periodo} dias={dias} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Cartao><p className="text-xs text-suave">Comissões</p><p className="text-xl font-bold">{formatarReais(somar(linhas, "comissao"))}</p></Cartao>
        <Cartao><p className="text-xs text-suave">Caixinhas</p><p className="text-xl font-bold">{formatarReais(somar(linhas, "caixinha"))}</p></Cartao>
        <Cartao className="col-span-2 border-rose-claro bg-agendado-fundo/40 sm:col-span-1">
          {tudoPago ? (
            <><p className="text-xs text-suave">Recebido</p><p className="text-xl font-bold text-sucesso">{formatarReais(somar(linhas))}</p></>
          ) : (
            <><p className="text-xs text-suave">Você recebe em {ddmm(periodo.pagamento)}</p><p className="text-xl font-bold text-rose">{formatarReais(recebe)}</p></>
          )}
        </Cartao>
      </div>
      <Cartao>
        <h3 className="mb-2 font-semibold">Extrato do período</h3>
        <TabelaExtrato linhas={linhas} mostrarPago />
      </Cartao>
      {(pags ?? []).length > 0 && (
        <Cartao>
          <h3 className="mb-2 font-semibold">Pagamentos recebidos</h3>
          <ul className="divide-y divide-borda text-sm">
            {(pags ?? []).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <span>{formatarDiaISO(p.data_pagamento)} <span className="text-suave">· período {ddmm(p.periodo_inicio)} a {ddmm(p.periodo_fim)}</span></span>
                <span className="font-semibold">{formatarReais(p.total_pago_centavos)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
