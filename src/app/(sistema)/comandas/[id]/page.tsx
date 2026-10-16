import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Trash2 } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, Cartao, Etiqueta, classeInput } from "@/components/ui";
import { SeletorCliente } from "@/components/seletor-cliente";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDataHora, formatarDiaISO, formatarPercentual, formatarReais, centavosParaCampo } from "@/lib/formato";
import { resolverComissao, type RegraComissao } from "@/lib/comissao";
import {
  alterarValorItem, anotarVisita, cancelarComanda, reabrirComanda, removerItem, trocarCliente,
} from "../actions";
import { AdicionarItem } from "./adicionar-item";
import { Fechamento, type ItemFechamento } from "./fechamento";

export const metadata: Metadata = { title: "Comanda" };

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

const NOME_FORMA: Record<string, string> = { pix: "Pix", credito: "Crédito", debito: "Débito", dinheiro: "Dinheiro", saldo: "Saldo na casa" };

export default async function PaginaComanda({ params, searchParams }: PageProps<"/comandas/[id]">) {
  const { profissional: eu } = await exigirEquipe();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  return eu.papel === "dono"
    ? <ComandaDono id={id} supabase={supabase} acabouDeFechar={sp.fechada === "1"} />
    : <ComandaEquipe id={id} supabase={supabase} euId={eu.id} />;
}

// ======================================================================
// Peças comuns
// ======================================================================

async function catalogo(supabase: Supabase) {
  const [{ data: servs }, { data: prods }, { data: profs }] = await Promise.all([
    supabase.from("servicos").select("id, nome, ativo, categoria_id, categorias(nome)").eq("ativo", true).order("nome"),
    supabase.from("produtos").select("id, nome, ativo, categorias(nome)").eq("ativo", true).order("nome"),
    supabase.from("profissionais").select("id, nome, recebe_comissao").eq("ativo", true).order("ordem").order("nome"),
  ]);
  type S = { id: string; nome: string; categoria_id: string; categorias: { nome: string } | null };
  const ordenar = (a: { grupo: string; nome: string }, b: { grupo: string; nome: string }) =>
    a.grupo.localeCompare(b.grupo, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR");
  return {
    servicos: ((servs ?? []) as unknown as S[]).map((s) => ({ id: s.id, nome: s.nome, grupo: s.categorias?.nome ?? "Outros", categoria_id: s.categoria_id })).sort(ordenar),
    produtos: ((prods ?? []) as unknown as S[]).map((s) => ({ id: s.id, nome: s.nome, grupo: s.categorias?.nome ?? "Outros" })).sort(ordenar),
    profissionais: profs ?? [],
  };
}

/** Quadro "Ficha da cliente" no topo da comanda */
async function FichaDaCliente({ supabase, clienteId }: { supabase: Supabase; clienteId: string | null }) {
  if (!clienteId) return null;
  const [{ data: ficha }, { data: anot }, { data: resumo }] = await Promise.all([
    supabase.from("fichas_tecnicas").select("cor_formula, alergias_cuidados").eq("cliente_id", clienteId).maybeSingle(),
    supabase.from("anotacoes_clientes").select("texto, criado_em").eq("cliente_id", clienteId).order("criado_em", { ascending: false }).limit(1),
    supabase.rpc("resumo_cliente", { p_cliente_id: clienteId }),
  ]);
  const ultima = anot?.[0];
  const ultimaVisita = (resumo as { ultima_visita?: string } | null)?.ultima_visita;
  return (
    <section aria-label="Ficha da cliente" className="grid gap-3 rounded-xl border border-borda bg-cartao p-4 text-sm sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-suave">Cor / fórmula</p>
        <p className="whitespace-pre-wrap">{ficha?.cor_formula || "—"}</p>
      </div>
      <div className={ficha?.alergias_cuidados ? "rounded-lg bg-aguardando-fundo p-2 text-aguardando" : ""}>
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
          {ficha?.alergias_cuidados && <AlertTriangle size={14} aria-hidden />} Cuidados / alergias
        </p>
        <p className="whitespace-pre-wrap">{ficha?.alergias_cuidados || "—"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-suave">Última anotação</p>
        <p>{ultima ? <>{ultima.texto} <span className="text-xs text-suave">({formatarDataHora(ultima.criado_em)})</span></> : "—"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-suave">Última visita</p>
        <p>{ultimaVisita ? formatarDiaISO(ultimaVisita) : "Primeira visita registrada"}</p>
      </div>
    </section>
  );
}

function Cabecalho({ numero, status, clienteId, clienteNome }: { numero: number; status: string; clienteId: string | null; clienteNome: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/comandas" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-rose">
        <ArrowLeft size={18} aria-hidden /> Comandas
      </Link>
      <h2 className="font-titulo text-3xl font-bold">
        Comanda #{numero} · {clienteId ? <Link href={`/clientes/${clienteId}`} className="hover:underline">{clienteNome}</Link> : "Cliente não identificada"}
      </h2>
      <Etiqueta tom={status === "aberta" ? "rose" : status === "fechada" ? "sucesso" : "erro"}>
        {status === "aberta" ? "Aberta" : status === "fechada" ? "Fechada" : "Cancelada"}
      </Etiqueta>
    </div>
  );
}

function AnotarVisita({ comandaId, clienteId }: { comandaId: string; clienteId: string | null }) {
  if (!clienteId) return null;
  return (
    <Cartao>
      <h3 className="mb-2 font-semibold">Anotação desta visita</h3>
      <FormAcao acao={anotarVisita} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="comanda_id" value={comandaId} />
        <input type="hidden" name="cliente_id" value={clienteId} />
        <input name="texto" required placeholder="Ex.: usou 7.1 + 8.1, cliente gostou do resultado" aria-label="Anotação da visita" className={`${classeInput} flex-1`} />
        <BotaoEnviar>Salvar</BotaoEnviar>
      </FormAcao>
    </Cartao>
  );
}

// ======================================================================
// Visão do DONO (com valores)
// ======================================================================

type ItemDono = {
  id: string; tipo: string; servico_id: string | null; produto_id: string | null; descricao: string;
  profissional_id: string; quantidade: number; valor_unitario_centavos: number; valor_total_centavos: number;
  comissao_percentual: number | null; comissao_centavos: number | null; profissionais: { nome: string } | null;
};

async function ComandaDono({ id, supabase, acabouDeFechar }: { id: string; supabase: Supabase; acabouDeFechar: boolean }) {
  const { data } = await supabase
    .from("comandas")
    .select("*, clientes(id, nome), comanda_itens(*, profissionais!comanda_itens_profissional_id_fkey(nome)), comanda_caixinhas(*), comanda_pagamentos(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as typeof data & {
    clientes: { id: string; nome: string } | null;
    comanda_itens: ItemDono[];
    comanda_caixinhas: { profissional_id: string; valor_centavos: number }[];
    comanda_pagamentos: { ordem: number; forma: string; valor_centavos: number; taxa_percentual: number | null; taxa_centavos: number | null }[];
  };
  const itens = [...c.comanda_itens].sort((a, b) => a.descricao.localeCompare(b.descricao));
  const aberta = c.status === "aberta";

  const [cat, { data: regras }, { data: cfg }, { data: saldoLinha }, { data: abertas }] = await Promise.all([
    catalogo(supabase),
    supabase.from("regras_comissao").select("*"),
    supabase.from("configuracoes").select("taxa_credito, taxa_debito, taxa_pix").single(),
    c.cliente_id ? supabase.from("saldos_clientes").select("saldo_centavos").eq("cliente_id", c.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("comandas").select("id, numero, clientes(nome)").eq("status", "aberta").order("aberta_em"),
  ]);

  // Prévia de comissão por item (vale a regra mais específica)
  const categoriaDe = new Map(cat.servicos.map((s) => [s.id, s.categoria_id]));
  const recebe = new Map(cat.profissionais.map((p) => [p.id, p.recebe_comissao]));
  const { data: prods } = await supabase.from("produtos").select("id, comissao_percentual");
  const pctProduto = new Map((prods ?? []).map((p) => [p.id, Number(p.comissao_percentual)]));
  const itensFech: ItemFechamento[] = itens.map((i) => {
    let pct: number | null;
    if (recebe.get(i.profissional_id) === false) pct = 0;
    else if (i.tipo === "produto") pct = pctProduto.get(i.produto_id!) ?? 0;
    else pct = resolverComissao((regras ?? []) as RegraComissao[], i.profissional_id, { id: i.servico_id!, categoria_id: categoriaDe.get(i.servico_id!) ?? "" })?.percentual ?? null;
    return {
      id: i.id, descricao: i.descricao, profissional_id: i.profissional_id, profissional_nome: i.profissionais?.nome ?? "",
      total: i.valor_total_centavos, percentual: pct, comissao: Math.round((i.valor_total_centavos * (pct ?? 0)) / 100),
    };
  });
  const profsNaComanda = [...new Map(itens.map((i) => [i.profissional_id, { id: i.profissional_id, nome: i.profissionais?.nome ?? "" }])).values()];
  const outrasAbertas = ((abertas ?? []) as unknown as { id: string; numero: number; clientes: { nome: string } | null }[]).filter((x) => x.id !== id);

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Comandas abertas ao lado */}
      {outrasAbertas.length > 0 && (
        <aside className="order-last lg:order-first lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Outras comandas abertas</p>
          <ul className="flex flex-col gap-1">
            {outrasAbertas.map((x) => (
              <li key={x.id}>
                <Link href={`/comandas/${x.id}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-borda bg-cartao px-3 text-sm hover:border-rose-claro">
                  <span className="font-bold text-atendimento">#{x.numero}</span>
                  <span className="truncate">{x.clientes?.nome ?? "Não identificada"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Cabecalho numero={c.numero} status={c.status} clienteId={c.cliente_id} clienteNome={c.clientes?.nome ?? null} />
        {acabouDeFechar && c.status === "fechada" && (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-sucesso/30 bg-[#E3EFE5] px-3 py-2 text-sm font-semibold text-sucesso">
            <CheckCircle2 size={18} aria-hidden /> Comanda fechada!
          </p>
        )}
        {c.reaberta_em && aberta && (
          <p className="rounded-lg bg-aguardando-fundo px-3 py-2 text-sm text-aguardando">
            Reaberta em {formatarDataHora(c.reaberta_em)} — motivo: {c.motivo}. As alterações ficam registradas no log.
          </p>
        )}
        <FichaDaCliente supabase={supabase} clienteId={c.cliente_id} />

        {aberta && !c.cliente_id && (
          <Cartao>
            <FormAcao acao={trocarCliente} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <input type="hidden" name="comanda_id" value={c.id} />
              <div className="flex-1"><SeletorCliente /></div>
              <BotaoEnviar>Definir cliente</BotaoEnviar>
            </FormAcao>
          </Cartao>
        )}

        {/* Itens */}
        <Cartao className="flex flex-col gap-3">
          <h3 className="font-semibold">Itens</h3>
          {itens.length === 0 ? (
            <p className="text-sm text-suave">Nenhum item lançado.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {itens.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.quantidade > 1 && `${i.quantidade}× `}{i.descricao}</span>
                    <span className="block text-xs text-suave">
                      {i.tipo === "produto" ? "Produto" : "Serviço"} · {i.profissionais?.nome}
                      {!aberta && i.comissao_percentual !== null && ` · comissão ${formatarPercentual(Number(i.comissao_percentual))} = ${formatarReais(i.comissao_centavos ?? 0)}`}
                    </span>
                  </span>
                  {aberta ? (
                    <>
                      <FormAcao acao={alterarValorItem} className="flex items-center gap-1">
                        <input type="hidden" name="comanda_id" value={c.id} />
                        <input type="hidden" name="item_id" value={i.id} />
                        <label className="sr-only" htmlFor={`v-${i.id}`}>Valor unitário de {i.descricao}</label>
                        <span className="text-xs text-suave">R$</span>
                        <input id={`v-${i.id}`} name="valor" inputMode="decimal" defaultValue={centavosParaCampo(i.valor_unitario_centavos)}
                          className={`${classeInput} w-24 text-right`} />
                        <BotaoEnviar variante="secundario" pendente="…" className="px-3">OK</BotaoEnviar>
                      </FormAcao>
                      <FormAcao acao={removerItem}>
                        <input type="hidden" name="comanda_id" value={c.id} />
                        <input type="hidden" name="item_id" value={i.id} />
                        <BotaoEnviar variante="fantasma" pendente="…" className="px-2" confirmar={`Remover ${i.descricao}?`}>
                          <Trash2 size={16} aria-label={`Remover ${i.descricao}`} />
                        </BotaoEnviar>
                      </FormAcao>
                    </>
                  ) : (
                    <span className="font-semibold">{formatarReais(i.valor_total_centavos)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {aberta && (
            <AdicionarItem comandaId={c.id} servicos={cat.servicos} produtos={cat.produtos}
              profissionais={cat.profissionais} podeEscolherProf profPadrao={itens[0]?.profissional_id ?? ""} />
          )}
        </Cartao>

        {aberta && <AnotarVisita comandaId={c.id} clienteId={c.cliente_id} />}

        {/* Fechamento ou resumo */}
        {aberta ? (
          <Cartao>
            {itens.length === 0 ? (
              <p className="text-sm text-suave">Lance pelo menos um item para fechar a comanda.</p>
            ) : (
              <Fechamento
                comandaId={c.id}
                itens={itensFech}
                profissionais={profsNaComanda}
                caixinhasIniciais={Object.fromEntries(c.comanda_caixinhas.map((x: { profissional_id: string; valor_centavos: number }) => [x.profissional_id, x.valor_centavos]))}
                pagamentosIniciais={[...c.comanda_pagamentos].sort((a, b) => a.ordem - b.ordem).map((p) => ({ forma: p.forma as never, valor_centavos: p.valor_centavos }))}
                taxas={{ credito: Number(cfg?.taxa_credito ?? 0), debito: Number(cfg?.taxa_debito ?? 0), pix: Number(cfg?.taxa_pix ?? 0), dinheiro: 0, saldo: 0 }}
                temCliente={Boolean(c.cliente_id)}
                saldoCliente={(saldoLinha as { saldo_centavos: number } | null)?.saldo_centavos ?? 0}
              />
            )}
            <FormAcao acao={cancelarComanda} className="mt-5 flex flex-col gap-2 border-t border-borda pt-4 sm:flex-row sm:items-end">
              <input type="hidden" name="comanda_id" value={c.id} />
              <Campo rotulo="Cancelar comanda — motivo (opcional)" className="flex-1">
                <input name="motivo" className={classeInput} />
              </Campo>
              <BotaoEnviar variante="perigo" pendente="Cancelando…" confirmar="Cancelar esta comanda? Os itens não serão cobrados.">Cancelar comanda</BotaoEnviar>
            </FormAcao>
          </Cartao>
        ) : (
          <ResumoFechada c={c} itens={itens} />
        )}
      </div>
    </div>
  );
}

function ResumoFechada({ c, itens }: {
  c: { id: string; status: string; fechada_em: string | null; cancelada_em: string | null; motivo: string | null;
    total_itens_centavos: number | null; total_caixinhas_centavos: number | null; total_taxas_centavos: number | null; total_comissoes_centavos: number | null;
    comanda_caixinhas: { profissional_id: string; valor_centavos: number }[];
    comanda_pagamentos: { ordem: number; forma: string; valor_centavos: number; taxa_percentual: number | null; taxa_centavos: number | null }[] };
  itens: ItemDono[];
}) {
  if (c.status === "cancelada") {
    return (
      <Cartao>
        <p className="text-sm">Cancelada em {c.cancelada_em && formatarDataHora(c.cancelada_em)}{c.motivo && ` — ${c.motivo}`}.</p>
      </Cartao>
    );
  }
  const profs = [...new Map(itens.map((i) => [i.profissional_id, i.profissionais?.nome ?? ""])).entries()];
  const caixinha = (id: string) => c.comanda_caixinhas.find((x) => x.profissional_id === id)?.valor_centavos ?? 0;
  const comissao = (id: string) => itens.filter((i) => i.profissional_id === id).reduce((t, i) => t + (i.comissao_centavos ?? 0), 0);
  const recebido = (c.total_itens_centavos ?? 0) + (c.total_caixinhas_centavos ?? 0);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Cartao>
        <h3 className="mb-2 font-semibold">Pagamento</h3>
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {[...c.comanda_pagamentos].sort((a, b) => a.ordem - b.ordem).map((p) => (
            <li key={p.ordem} className="flex justify-between">
              <span>{NOME_FORMA[p.forma]}{(p.taxa_centavos ?? 0) > 0 && <span className="text-xs text-suave"> (taxa {formatarPercentual(Number(p.taxa_percentual))} = {formatarReais(p.taxa_centavos!)})</span>}</span>
              <span className="font-medium">{formatarReais(p.valor_centavos)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t border-borda pt-2 text-sm">
          <dt>Itens (faturamento)</dt><dd className="text-right">{formatarReais(c.total_itens_centavos ?? 0)}</dd>
          <dt>Caixinhas (repasse)</dt><dd className="text-right">{formatarReais(c.total_caixinhas_centavos ?? 0)}</dd>
          <dt className="text-suave">Taxas da maquininha</dt><dd className="text-right text-suave">− {formatarReais(c.total_taxas_centavos ?? 0)}</dd>
          <dt className="text-suave">Comissões</dt><dd className="text-right text-suave">− {formatarReais(c.total_comissoes_centavos ?? 0)}</dd>
          <dt className="font-bold">Total recebido</dt><dd className="text-right font-bold">{formatarReais(recebido)}</dd>
        </dl>
        <p className="mt-2 text-xs text-suave">Fechada em {c.fechada_em && formatarDataHora(c.fechada_em)}.</p>
      </Cartao>
      <Cartao>
        <h3 className="mb-2 font-semibold">A receber no próximo pagamento</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {profs.map(([id, nome]) => (
            <li key={id} className="rounded-lg bg-fundo p-3">
              <p className="font-semibold">{nome}</p>
              <p>Comissão {formatarReais(comissao(id))} + caixinha {formatarReais(caixinha(id))} = <strong>{formatarReais(comissao(id) + caixinha(id))}</strong></p>
            </li>
          ))}
        </ul>
      </Cartao>
      <Cartao className="md:col-span-2">
        <h3 className="mb-1 font-semibold">Reabrir comanda</h3>
        <p className="mb-3 text-xs text-suave">Desfaz comissões, caixinhas, baixa de estoque e uso de saldo desta comanda. Fica registrado no log.</p>
        <FormAcao acao={reabrirComanda} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="comanda_id" value={c.id} />
          <Campo rotulo="Motivo" className="flex-1"><input name="motivo" required className={classeInput} /></Campo>
          <BotaoEnviar variante="secundario" pendente="Reabrindo…" confirmar="Reabrir esta comanda?">Reabrir</BotaoEnviar>
        </FormAcao>
      </Cartao>
    </div>
  );
}

// ======================================================================
// Visão da PROFISSIONAL (sem valores)
// ======================================================================

type ComandaEq = {
  id: string; numero: number; status: string; cliente_id: string | null; cliente_nome: string | null;
  itens: { id: string; tipo: string; descricao: string; quantidade: number; profissional_id: string; profissional_nome: string }[];
};

async function ComandaEquipe({ id, supabase, euId }: { id: string; supabase: Supabase; euId: string }) {
  const { data } = await supabase.rpc("comanda_equipe", { p_comanda_id: id });
  const c = data as ComandaEq | null;
  if (!c) {
    return (
      <Cartao className="mx-auto max-w-lg text-center">
        <p className="font-semibold">Esta comanda já foi fechada ou não está disponível.</p>
        <Link href="/comandas" className="mt-2 inline-block text-sm font-semibold text-rose">Ver comandas abertas</Link>
      </Cartao>
    );
  }
  const cat = await catalogo(supabase);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Cabecalho numero={c.numero} status={c.status} clienteId={c.cliente_id} clienteNome={c.cliente_nome} />
      <FichaDaCliente supabase={supabase} clienteId={c.cliente_id} />
      <Cartao className="flex flex-col gap-3">
        <h3 className="font-semibold">Itens</h3>
        {c.itens.length === 0 ? (
          <p className="text-sm text-suave">Nenhum item lançado.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {c.itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{i.quantidade > 1 && `${i.quantidade}× `}{i.descricao}</span>
                  <span className="block text-xs text-suave">{i.tipo === "produto" ? "Produto" : "Serviço"} · {i.profissional_nome}</span>
                </span>
                {i.profissional_id === euId && (
                  <FormAcao acao={removerItem}>
                    <input type="hidden" name="comanda_id" value={c.id} />
                    <input type="hidden" name="item_id" value={i.id} />
                    <BotaoEnviar variante="fantasma" pendente="…" className="px-2" confirmar={`Remover ${i.descricao}?`}>
                      <Trash2 size={16} aria-label={`Remover ${i.descricao}`} />
                    </BotaoEnviar>
                  </FormAcao>
                )}
              </li>
            ))}
          </ul>
        )}
        <AdicionarItem comandaId={c.id} servicos={cat.servicos} produtos={cat.produtos}
          profissionais={[]} podeEscolherProf={false} profPadrao={euId} />
        <p className="text-xs text-suave">Os itens entram em seu nome. Valores e fechamento ficam com a recepção.</p>
      </Cartao>
      <AnotarVisita comandaId={c.id} clienteId={c.cliente_id} />
    </div>
  );
}
