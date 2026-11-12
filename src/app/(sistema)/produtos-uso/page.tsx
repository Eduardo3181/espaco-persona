import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Abas, BotaoLink, Campo, Cartao, Vazio, classeInput } from "@/components/ui";
import { MESES, centavosParaCampo, formatarReais, hojeISO } from "@/lib/formato";
import { somarDias } from "@/lib/agenda";
import { somarMeses } from "@/lib/gestao";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  TIPOS_USO, compraSugerida, emEmbalagens, formatarQuantidade, nomeEmbalagem, nomeProdutoUso, ordenarProdutosUso, type ProdutoUso,
} from "@/lib/produtos-uso";
import { salvarProdutoUso } from "./actions";
import { CopiarTexto } from "./copiar-texto";
import { ListaProdutosUso } from "./lista";

export const metadata: Metadata = { title: "Produtos de uso" };

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;
type Consumo = { produto_uso_id: string; quantidade: number; custo_centavos: number; atendimentos: number };

const ABAS = [
  { id: "produtos", rotulo: "Produtos" },
  { id: "consumo", rotulo: "Consumo do mês" },
  { id: "pedido", rotulo: "Sugestão de pedido" },
];

async function buscarProdutos(supabase: Supabase) {
  const { data } = await supabase.from("produtos_uso").select("*");
  return ordenarProdutosUso((data ?? []) as ProdutoUso[]);
}

async function consumo(supabase: Supabase, inicio: string, fim: string) {
  const { data } = await supabase.rpc("consumo_produtos_uso", { p_inicio: inicio, p_fim: fim });
  return new Map(((data ?? []) as Consumo[]).map((c) => [c.produto_uso_id, c]));
}

export default async function PaginaProdutosUso({ searchParams }: PageProps<"/produtos-uso">) {
  await exigirDono();
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.id === sp.aba) ? String(sp.aba) : "produtos";
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : hojeISO().slice(0, 7);
  const supabase = await criarClienteServidor();
  const produtos = await buscarProdutos(supabase);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Abas atual={aba} abas={ABAS.map((a) => ({ ...a, href: `/produtos-uso?aba=${a.id}` }))} />
      {aba === "produtos" && <AbaProdutos produtos={produtos} editar={typeof sp.editar === "string" ? sp.editar : undefined} />}
      {aba === "consumo" && <AbaConsumo supabase={supabase} produtos={produtos} mes={mes} />}
      {aba === "pedido" && <AbaPedido supabase={supabase} produtos={produtos} />}
    </div>
  );
}

// ---------------------------------------------------------------- Produtos

function AbaProdutos({ produtos, editar }: { produtos: ProdutoUso[]; editar?: string }) {
  const emEdicao = produtos.find((p) => p.id === editar);
  const formAberto = editar === "novo" || Boolean(emEdicao);
  const familias = [...new Set(produtos.map((p) => p.familia).filter(Boolean))] as string[];
  const estoqueEmb = emEdicao ? emEmbalagens(emEdicao.estoque_qtd, emEdicao.embalagem_qtd) : null;
  const decimal = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)).replace(".", ","));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-suave">Produtos usados nos atendimentos, com custo por grama e estoque. Coloração aparece só pelo número.</p>
        {!formAberto && <BotaoLink href="/produtos-uso?editar=novo"><Plus size={18} aria-hidden /> Novo produto</BotaoLink>}
      </div>

      {formAberto && (
        <Cartao>
          <h2 className="mb-4 text-lg font-semibold">{emEdicao ? `Editar ${nomeProdutoUso(emEdicao)}` : "Novo produto de uso"}</h2>
          <FormAcao key={editar} acao={salvarProdutoUso} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
            <Campo rotulo="Tipo">
              <select name="tipo" required defaultValue={emEdicao?.tipo ?? "coloracao"} className={classeInput}>
                {TIPOS_USO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Família (opcional)">
              <input name="familia" list="familias-uso" defaultValue={emEdicao?.familia ?? ""} className={classeInput} />
              <datalist id="familias-uso">{familias.map((f) => <option key={f} value={f} />)}</datalist>
            </Campo>
            <Campo rotulo="Número / tom" dica="Texto, como 7.1, 10.0 ou M89. Obrigatório para coloração.">
              <input name="numero" defaultValue={emEdicao?.numero ?? ""} className={classeInput} />
            </Campo>
            <Campo rotulo="Nome" dica="Para coloração, pode deixar vazio: aparece como “Coloração 7.1”.">
              <input name="nome" defaultValue={emEdicao?.nome ?? ""} placeholder="Ex.: Oxidante 20 volumes" className={classeInput} />
            </Campo>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Campo rotulo="Tamanho da embalagem">
                <input name="embalagem" inputMode="decimal" defaultValue={decimal(emEdicao?.embalagem_qtd)} placeholder="60" className={classeInput} />
              </Campo>
              <Campo rotulo="Unidade">
                <select name="unidade" defaultValue={emEdicao?.unidade ?? "g"} className={classeInput}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </Campo>
            </div>
            <Campo rotulo="Valor de compra da embalagem (R$)">
              <input name="valor" inputMode="decimal" placeholder="0,00" defaultValue={emEdicao?.valor_compra_centavos ? centavosParaCampo(emEdicao.valor_compra_centavos) : ""} className={classeInput} />
            </Campo>
            <Campo rotulo="Estoque atual (embalagens)" dica="Pode ser fracionado, como 1,5.">
              <input name="estoque" inputMode="decimal" defaultValue={decimal(estoqueEmb)} placeholder="0" className={classeInput} />
            </Campo>
            <Campo rotulo="Estoque mínimo (embalagens)">
              <input name="minimo" inputMode="decimal" defaultValue={decimal(emEdicao?.estoque_minimo_embalagens)} placeholder="0" className={classeInput} />
            </Campo>
            <Campo rotulo="Observação (opcional)" className="sm:col-span-2">
              <input name="observacao" defaultValue={emEdicao?.observacao ?? ""} className={classeInput} />
            </Campo>
            <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
              <input type="checkbox" name="ativo" defaultChecked={emEdicao?.ativo ?? true} className="size-5 accent-rose" />
              Ativo (aparece na comanda)
            </label>
            <div className="flex gap-3 sm:col-span-2">
              <BotaoEnviar>Salvar</BotaoEnviar>
              <BotaoLink href="/produtos-uso" variante="secundario">Cancelar</BotaoLink>
            </div>
          </FormAcao>
        </Cartao>
      )}

      <ListaProdutosUso produtos={produtos} />
    </>
  );
}

// ---------------------------------------------------------------- Consumo do mês

async function AbaConsumo({ supabase, produtos, mes }: { supabase: Supabase; produtos: ProdutoUso[]; mes: string }) {
  const inicio = `${mes}-01`;
  const fim = somarDias(somarMeses(inicio, 1), -1);
  const usados = await consumo(supabase, inicio, fim);
  const linhas = produtos.filter((p) => usados.has(p.id)).map((p) => ({ p, c: usados.get(p.id)! }));
  const total = (tipo?: string) => linhas.filter((l) => !tipo || l.p.tipo === tipo)
    .reduce((t, l) => ({ qtd: t.qtd + Number(l.c.quantidade), custo: t.custo + Number(l.c.custo_centavos) }), { qtd: 0, custo: 0 });
  const [a, m] = mes.split("-").map(Number);

  return (
    <>
      <div className="flex items-center gap-2">
        <Link href={`/produtos-uso?aba=consumo&mes=${somarMeses(inicio, -1).slice(0, 7)}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Mês anterior"><ChevronLeft size={20} /></Link>
        <h2 className="font-titulo text-3xl font-bold first-letter:uppercase">{MESES[m - 1]} de {a}</h2>
        <Link href={`/produtos-uso?aba=consumo&mes=${somarMeses(inicio, 1).slice(0, 7)}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Próximo mês"><ChevronRight size={20} /></Link>
      </div>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Coloração", total("coloracao")], ["Oxidante", total("oxidante")], ["Total do mês", total()]].map(([rotulo, t]) => (
          <div key={rotulo as string} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-suave">{rotulo as string}</p>
            <p className="mt-1 text-lg font-bold">{formatarReais((t as { custo: number }).custo)}</p>
            <p className="text-xs text-suave">{formatarQuantidade((t as { qtd: number }).qtd, "g")}</p>
          </div>
        ))}
      </section>
      {linhas.length === 0 ? <Vazio>Nenhum produto usado em comandas fechadas neste mês.</Vazio> : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-cartao">
          <table className="w-full min-w-[34rem] text-right text-sm">
            <thead className="bg-escuro text-xs text-sobre-escuro">
              <tr><th className="px-3 py-2 text-left font-semibold">Produto</th><th className="px-3 py-2 font-semibold">Usado</th><th className="px-3 py-2 font-semibold">Em embalagens</th><th className="px-3 py-2 font-semibold">Custo</th></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map(({ p, c }) => {
                const emb = emEmbalagens(c.quantidade, p.embalagem_qtd);
                return (
                  <tr key={p.id}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">{nomeProdutoUso(p)}</th>
                    <td className="px-3 py-2">{formatarQuantidade(c.quantidade, p.unidade)}</td>
                    <td className="px-3 py-2">{emb === null ? "—" : `${emb.toLocaleString("pt-BR")} ${nomeEmbalagem(p.tipo, emb)}`}</td>
                    <td className="px-3 py-2">{formatarReais(Number(c.custo_centavos))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-suave">Conta os produtos das comandas fechadas, pelo dia do atendimento. O custo é o do dia em que cada comanda foi fechada.</p>
    </>
  );
}

// ---------------------------------------------------------------- Sugestão de pedido

async function AbaPedido({ supabase, produtos }: { supabase: Supabase; produtos: ProdutoUso[] }) {
  // Consumo médio mensal: últimos 90 dias ÷ 3
  const hoje = hojeISO();
  const usados = await consumo(supabase, somarDias(hoje, -89), hoje);
  const sugestao = produtos.filter((p) => p.ativo).map((p) => {
    const mensal = Number(usados.get(p.id)?.quantidade ?? 0) / 3;
    return { p, mensal, comprar: compraSugerida(p, mensal) };
  }).filter((s) => s.comprar > 0);
  const semEmbalagem = produtos.filter((p) => p.ativo && !p.embalagem_qtd);
  const texto = [
    `Pedido – Espaço Persona (${hoje.split("-").reverse().join("/")})`,
    "",
    ...sugestao.map((s) => `${nomeProdutoUso(s.p)} — ${s.comprar} ${nomeEmbalagem(s.p.tipo, s.comprar)}`),
  ].join("\n");

  return (
    <>
      <p className="text-sm text-suave">
        Comprar = consumo médio do mês (últimos 3 meses) + estoque mínimo − estoque atual, arredondado para embalagens inteiras. Aparecem só os produtos que precisam de compra.
      </p>
      {semEmbalagem.length > 0 && (
        <p className="rounded-lg bg-aguardando-fundo px-3 py-2 text-sm text-aguardando">
          Sem o tamanho da embalagem, fica de fora: {semEmbalagem.map(nomeProdutoUso).join(", ")}.{" "}
          <Link href="/produtos-uso" className="font-semibold underline">Completar</Link>
        </p>
      )}
      {sugestao.length === 0 ? <Vazio>Nada para comprar agora. Confira se o estoque atual e o mínimo estão preenchidos.</Vazio> : (
        <>
          <div className="overflow-x-auto rounded-xl border border-borda bg-cartao">
            <table className="w-full min-w-[36rem] text-right text-sm">
              <thead className="bg-escuro text-xs text-sobre-escuro">
                <tr><th className="px-3 py-2 text-left font-semibold">Produto</th><th className="px-3 py-2 font-semibold">Consumo/mês</th><th className="px-3 py-2 font-semibold">Estoque</th><th className="px-3 py-2 font-semibold">Mínimo</th><th className="px-3 py-2 font-semibold">Comprar</th></tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {sugestao.map(({ p, mensal, comprar }) => (
                  <tr key={p.id}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">{nomeProdutoUso(p)}</th>
                    <td className="px-3 py-2">{formatarQuantidade(Math.round(mensal), p.unidade)}</td>
                    <td className="px-3 py-2">{(emEmbalagens(p.estoque_qtd, p.embalagem_qtd) ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">{Number(p.estoque_minimo_embalagens).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 font-semibold">{comprar} {nomeEmbalagem(p.tipo, comprar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Cartao>
            <h3 className="mb-2 font-semibold">Lista para o fornecedor</h3>
            <CopiarTexto texto={texto} />
          </Cartao>
        </>
      )}
    </>
  );
}
