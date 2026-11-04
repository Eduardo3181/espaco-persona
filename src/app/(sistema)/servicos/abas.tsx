import type { ReactNode } from "react";
import { Percent, Plus } from "lucide-react";
import { BotaoEnviar, FormAcao, type AcaoForm } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Etiqueta, Vazio, classeBotao, classeInput } from "@/components/ui";
import { centavosParaCampo, formatarPercentual, formatarReais, lerReajuste, precoReajustado } from "@/lib/formato";
import { comissaoHerdada, resolverComissao, type RegraComissao } from "@/lib/comissao";
import { aplicarReajuste, salvarCategoria, salvarPacote, salvarProduto, salvarServico } from "./actions";
import { ListaServicos } from "./lista-servicos";
import { Grupo, Linha } from "./pecas";

type Categoria = { id: string; nome: string; tipo: "servico" | "produto"; ativo: boolean };
type Servico = { id: string; nome: string; categoria_id: string; duracao_min: number; preco_centavos: number; ativo: boolean };
type Produto = {
  id: string; nome: string; categoria_id: string; preco_centavos: number; estoque: number;
  estoque_minimo: number; comissao_percentual: number; ativo: boolean;
};
type Pacote = { id: string; nome: string; validade_dias: number; preco_centavos: number; ativo: boolean };
type PacoteServico = { pacote_id: string; servico_id: string; quantidade: number };
type ProfissionalComissao = { id: string; nome: string };

export type Dados = {
  categorias: Categoria[];
  servicos: Servico[];
  produtos: Produto[];
  pacotes: Pacote[];
  pacoteServicos: PacoteServico[];
  profissionais: ProfissionalComissao[];
  regras: RegraComissao[];
};

type PropsAba = { dados: Dados; ehDono: boolean; editar?: string; reajuste?: { percentual: string; categoria: string } };

// ------------------------------------------------------------ peças comuns

function Cabecalho({ texto, aba, rotuloNovo, ehDono, formAberto, extra }: {
  texto: string; aba: string; rotuloNovo: string; ehDono: boolean; formAberto: boolean; extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-suave">{texto}</p>
      {ehDono && !formAberto && (
        <div className="flex flex-wrap gap-2">
          {extra}
          <BotaoLink href={`/servicos?aba=${aba}&editar=novo`}>
            <Plus size={18} aria-hidden /> {rotuloNovo}
          </BotaoLink>
        </div>
      )}
    </div>
  );
}

function PainelForm({ titulo, aba, acao, chave, children }: {
  titulo: string; aba: string; acao: AcaoForm; chave: string; children: ReactNode;
}) {
  return (
    <Cartao>
      <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
      <FormAcao key={chave} acao={acao} className="grid gap-4 sm:grid-cols-2">
        {children}
        <div className="flex gap-3 sm:col-span-2">
          <BotaoEnviar>Salvar</BotaoEnviar>
          <BotaoLink href={`/servicos?aba=${aba}`} variante="secundario">Cancelar</BotaoLink>
        </div>
      </FormAcao>
    </Cartao>
  );
}

function CaixaAtivo({ ativo, rotulo = "Ativo (aparece para uso)" }: { ativo?: boolean; rotulo?: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
      <input type="checkbox" name="ativo" defaultChecked={ativo ?? true} className="size-5 accent-rose" />
      {rotulo}
    </label>
  );
}

function opcoesCategoria(categorias: Categoria[], tipo: Categoria["tipo"], atual?: string) {
  return categorias.filter((c) => c.tipo === tipo && (c.ativo || c.id === atual));
}

function agruparPorCategoria<T extends { categoria_id: string; ativo: boolean }>(itens: T[], categorias: Categoria[]) {
  const ordenados = [...itens].sort((a, b) => Number(b.ativo) - Number(a.ativo));
  return categorias
    .map((c) => ({ categoria: c, itens: ordenados.filter((i) => i.categoria_id === c.id) }))
    .filter((g) => g.itens.length);
}

// ------------------------------------------------------------ Serviços

export function AbaServicos({ dados, ehDono, editar, reajuste }: PropsAba) {
  const emEdicao = dados.servicos.find((s) => s.id === editar);
  const formAberto = editar === "novo" || Boolean(emEdicao);
  const grupos = agruparPorCategoria(dados.servicos, dados.categorias);
  const categoriasServico = opcoesCategoria(dados.categorias, "servico", emEdicao?.categoria_id);

  return (
    <>
      <Cabecalho
        texto="Serviços oferecidos, com duração e valor “a partir de”."
        aba="servicos" rotuloNovo="Novo serviço" ehDono={ehDono} formAberto={formAberto}
        extra={reajuste === undefined && (
          <BotaoLink href="/servicos?aba=servicos&reajuste=" variante="secundario">
            <Percent size={18} aria-hidden /> Reajustar preços
          </BotaoLink>
        )}
      />

      {ehDono && formAberto && (
        <PainelForm titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo serviço"} aba="servicos" acao={salvarServico} chave={editar!}>
          <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
          <Campo rotulo="Nome do serviço">
            <input name="nome" required defaultValue={emEdicao?.nome} className={classeInput} />
          </Campo>
          <Campo rotulo="Categoria">
            <select name="categoria_id" required defaultValue={emEdicao?.categoria_id ?? ""} className={classeInput}>
              <option value="" disabled>Escolha…</option>
              {categoriasServico.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Duração (minutos)">
            <input name="duracao_min" type="number" min={5} max={720} step={5} required defaultValue={emEdicao?.duracao_min ?? 30} className={classeInput} />
          </Campo>
          <Campo rotulo="Valor a partir de (R$)">
            <input name="preco" inputMode="decimal" required placeholder="0,00"
              defaultValue={emEdicao ? centavosParaCampo(emEdicao.preco_centavos) : ""} className={classeInput} />
          </Campo>

          {dados.profissionais.length > 0 && (
            <fieldset className="rounded-lg border border-borda p-4 sm:col-span-2">
              <legend className="px-1 text-sm font-semibold">Comissão neste serviço (%)</legend>
              <p className="mb-3 text-xs text-suave">
                Deixe em branco para usar a regra da categoria ou o padrão da profissional (veja em Configurações → Regras de comissão).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {dados.profissionais.map((p) => {
                  const propria = emEdicao && dados.regras.find(
                    (r) => r.tipo === "servico" && r.servico_id === emEdicao.id && r.profissional_id === p.id,
                  );
                  const herdada = comissaoHerdada(dados.regras, p.id, emEdicao?.categoria_id ?? "");
                  return (
                    <Campo key={p.id} rotulo={p.nome}
                      dica={herdada ? `Sem preencher: ${formatarPercentual(herdada.percentual)} (${herdada.origem})` : "Sem preencher: sem regra definida"}>
                      <input name={`comissao_${p.id}`} inputMode="decimal" placeholder={herdada ? String(herdada.percentual).replace(".", ",") : "—"}
                        defaultValue={propria ? String(propria.percentual).replace(".", ",") : ""} className={classeInput} />
                    </Campo>
                  );
                })}
              </div>
            </fieldset>
          )}
          <CaixaAtivo ativo={emEdicao?.ativo} />
        </PainelForm>
      )}

      {ehDono && reajuste !== undefined && !formAberto && <PainelReajuste dados={dados} reajuste={reajuste} />}

      <ListaServicos ehDono={ehDono} grupos={grupos.map(({ categoria, itens }) => ({
        categoria: { id: categoria.id, nome: categoria.nome },
        itens: itens.map((s) => ({
          id: s.id, nome: s.nome, ativo: s.ativo, duracao_min: s.duracao_min, preco_centavos: s.preco_centavos,
          comissoes: ehDono ? dados.profissionais.map((p) => {
            const c = resolverComissao(dados.regras, p.id, s);
            return { nome: p.nome.split(" ")[0], texto: c ? formatarPercentual(c.percentual) : null };
          }) : undefined,
        })),
      }))} />
    </>
  );
}

/** Reajuste em massa: escolhe percentual e categoria, vê a prévia "antes → depois" e confirma. */
function PainelReajuste({ dados, reajuste }: { dados: Dados; reajuste: { percentual: string; categoria: string } }) {
  const percentual = lerReajuste(reajuste.percentual);
  const categorias = opcoesCategoria(dados.categorias, "servico");
  const categoria = categorias.find((c) => c.id === reajuste.categoria);
  const nomeCategoria = new Map(dados.categorias.map((c) => [c.id, c.nome]));
  const previa = percentual === null ? [] : dados.servicos
    .filter((s) => s.ativo && (!categoria || s.categoria_id === categoria.id))
    .map((s) => ({ ...s, novo: precoReajustado(s.preco_centavos, percentual) }))
    .filter((s) => s.novo !== s.preco_centavos)
    .sort((a, b) => (nomeCategoria.get(a.categoria_id) ?? "").localeCompare(nomeCategoria.get(b.categoria_id) ?? "", "pt-BR")
      || a.nome.localeCompare(b.nome, "pt-BR"));
  const textoPct = percentual === null ? "" : formatarPercentual(percentual);
  const qtd = `${previa.length} ${previa.length === 1 ? "serviço" : "serviços"}`;

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Reajustar preços</h2>
        <p className="text-sm text-suave">
          Aplica um percentual aos serviços ativos e arredonda para cima até o real inteiro. Comandas já lançadas não mudam.
        </p>
      </div>
      <form action="/servicos" method="get" className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-start">
        <input type="hidden" name="aba" value="servicos" />
        <Campo rotulo="Percentual (%)" dica="Ex.: 10 ou 7,5. Negativo baixa o preço.">
          <input name="reajuste" inputMode="decimal" required placeholder="10" defaultValue={reajuste.percentual} className={classeInput} />
        </Campo>
        <Campo rotulo="Aplicar em">
          <select name="categoria" defaultValue={categoria?.id ?? ""} className={classeInput}>
            <option value="">Todos os serviços</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>Só {c.nome}</option>)}
          </select>
        </Campo>
        <button className={classeBotao("secundario", "sm:mt-6")}>Ver prévia</button>
      </form>

      {reajuste.percentual && percentual === null && (
        <p className="text-sm font-semibold text-erro">Percentual inválido. Use um número entre -99 e 100, diferente de zero (ex.: 10 ou 7,5).</p>
      )}
      {percentual !== null && (previa.length === 0 ? (
        <Vazio>Nenhum preço muda com {textoPct}{categoria && ` em ${categoria.nome}`}.</Vazio>
      ) : (
        <>
          <p className="text-sm">
            Prévia: <strong>{textoPct}</strong> em <strong>{qtd}</strong>{categoria && <> de <strong>{categoria.nome}</strong></>}. Confira antes de aplicar.
          </p>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-borda">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-fundo text-left text-xs text-suave">
                <tr><th className="px-3 py-2 font-semibold">Serviço</th><th className="px-3 py-2 text-right font-semibold">Antes → depois</th></tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {previa.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{s.nome}<span className="block text-xs text-suave">{nomeCategoria.get(s.categoria_id)}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <span className="text-suave">{formatarReais(s.preco_centavos)}</span> → <strong>{formatarReais(s.novo)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FormAcao acao={aplicarReajuste} className="flex flex-wrap gap-3">
            <input type="hidden" name="percentual" value={reajuste.percentual} />
            <input type="hidden" name="categoria_id" value={categoria?.id ?? ""} />
            <BotaoEnviar pendente="Aplicando…" confirmar={`Aplicar ${textoPct} em ${qtd}${categoria ? ` de ${categoria.nome}` : ""}?`}>
              Aplicar reajuste em {qtd}
            </BotaoEnviar>
            <BotaoLink href="/servicos?aba=servicos" variante="secundario">Cancelar</BotaoLink>
          </FormAcao>
        </>
      ))}
      {(percentual === null || previa.length === 0) && (
        <BotaoLink href="/servicos?aba=servicos" variante="secundario" className="self-start">Fechar</BotaoLink>
      )}
    </Cartao>
  );
}

// ------------------------------------------------------------ Produtos

export function AbaProdutos({ dados, ehDono, editar }: PropsAba) {
  const emEdicao = dados.produtos.find((p) => p.id === editar);
  const formAberto = editar === "novo" || Boolean(emEdicao);
  const grupos = agruparPorCategoria(dados.produtos, dados.categorias);
  const categoriasProduto = opcoesCategoria(dados.categorias, "produto", emEdicao?.categoria_id);

  return (
    <>
      <Cabecalho texto="Produtos à venda, com estoque e comissão de venda." aba="produtos" rotuloNovo="Novo produto" ehDono={ehDono} formAberto={formAberto} />

      {ehDono && formAberto && (
        <PainelForm titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo produto"} aba="produtos" acao={salvarProduto} chave={editar!}>
          <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
          <Campo rotulo="Nome do produto">
            <input name="nome" required defaultValue={emEdicao?.nome} className={classeInput} />
          </Campo>
          <Campo rotulo="Categoria">
            <select name="categoria_id" required defaultValue={emEdicao?.categoria_id ?? ""} className={classeInput}>
              <option value="" disabled>Escolha…</option>
              {categoriasProduto.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Preço (R$)">
            <input name="preco" inputMode="decimal" required placeholder="0,00"
              defaultValue={emEdicao ? centavosParaCampo(emEdicao.preco_centavos) : ""} className={classeInput} />
          </Campo>
          <Campo rotulo="Comissão de venda (%)">
            <input name="comissao_percentual" inputMode="decimal" required
              defaultValue={String(emEdicao?.comissao_percentual ?? 10).replace(".", ",")} className={classeInput} />
          </Campo>
          <Campo rotulo="Estoque atual">
            <input name="estoque" type="number" step={1} required defaultValue={emEdicao?.estoque ?? 0} className={classeInput} />
          </Campo>
          <Campo rotulo="Avisar quando o estoque chegar a" dica="0 = não avisar">
            <input name="estoque_minimo" type="number" min={0} step={1} required defaultValue={emEdicao?.estoque_minimo ?? 0} className={classeInput} />
          </Campo>
          <CaixaAtivo ativo={emEdicao?.ativo} />
        </PainelForm>
      )}

      {grupos.length === 0 ? (
        <Vazio>Nenhum produto cadastrado ainda.</Vazio>
      ) : (
        grupos.map(({ categoria, itens }) => (
          <Grupo key={categoria.id} titulo={categoria.nome}>
            {itens.map((p) => {
              const baixo = p.ativo && p.estoque_minimo > 0 && p.estoque <= p.estoque_minimo;
              return (
                <Linha key={p.id} inativo={!p.ativo} ehDono={ehDono} nome={p.nome} editarHref={`/servicos?aba=produtos&editar=${p.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">{p.nome} {!p.ativo && <Etiqueta tom="erro">Inativo</Etiqueta>}</p>
                    <p className="text-sm font-semibold">{formatarReais(p.preco_centavos)}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-suave">
                    {baixo ? <Etiqueta tom="aviso">Estoque baixo: {p.estoque}</Etiqueta> : <span>Estoque: {p.estoque}</span>}
                    <span>· Comissão de venda {formatarPercentual(Number(p.comissao_percentual))}</span>
                  </div>
                </Linha>
              );
            })}
          </Grupo>
        ))
      )}
    </>
  );
}

// ------------------------------------------------------------ Pacotes

export function AbaPacotes({ dados, ehDono, editar }: PropsAba) {
  const emEdicao = dados.pacotes.find((p) => p.id === editar);
  const formAberto = editar === "novo" || Boolean(emEdicao);
  const nomeServico = new Map(dados.servicos.map((s) => [s.id, s.nome]));
  const itensDo = (pacoteId: string) => dados.pacoteServicos.filter((i) => i.pacote_id === pacoteId);
  const pacotes = [...dados.pacotes].sort((a, b) => Number(b.ativo) - Number(a.ativo));

  return (
    <>
      <Cabecalho texto="Combos de serviços vendidos com validade em dias." aba="pacotes" rotuloNovo="Novo pacote" ehDono={ehDono} formAberto={formAberto} />

      {ehDono && formAberto && (
        <PainelForm titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo pacote"} aba="pacotes" acao={salvarPacote} chave={editar!}>
          <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
          <Campo rotulo="Nome do pacote" className="sm:col-span-2">
            <input name="nome" required defaultValue={emEdicao?.nome} className={classeInput} />
          </Campo>
          <Campo rotulo="Validade (dias)" dica="Contados a partir da compra">
            <input name="validade_dias" type="number" min={1} step={1} required defaultValue={emEdicao?.validade_dias ?? 60} className={classeInput} />
          </Campo>
          <Campo rotulo="Preço do pacote (R$)">
            <input name="preco" inputMode="decimal" required placeholder="0,00"
              defaultValue={emEdicao ? centavosParaCampo(emEdicao.preco_centavos) : ""} className={classeInput} />
          </Campo>
          <fieldset className="rounded-lg border border-borda p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold">Serviços incluídos (quantidade)</legend>
            <p className="mb-3 text-xs text-suave">Deixe em branco os serviços que não fazem parte do pacote.</p>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {dados.servicos
                .filter((s) => s.ativo || (emEdicao && itensDo(emEdicao.id).some((i) => i.servico_id === s.id)))
                .map((s) => {
                  const qtd = emEdicao ? itensDo(emEdicao.id).find((i) => i.servico_id === s.id)?.quantidade : undefined;
                  return (
                    <label key={s.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                      <span>{s.nome}</span>
                      <input name={`qtd_${s.id}`} type="number" min={0} step={1} defaultValue={qtd ?? ""} placeholder="0"
                        className={`${classeInput} w-20 text-center`} aria-label={`Quantidade de ${s.nome}`} />
                    </label>
                  );
                })}
            </div>
          </fieldset>
          <CaixaAtivo ativo={emEdicao?.ativo} rotulo="Ativo (pode ser vendido)" />
        </PainelForm>
      )}

      {pacotes.length === 0 ? (
        <Vazio>Nenhum pacote cadastrado ainda.</Vazio>
      ) : (
        <Grupo titulo="Pacotes">
          {pacotes.map((p) => (
            <Linha key={p.id} inativo={!p.ativo} ehDono={ehDono} nome={p.nome} editarHref={`/servicos?aba=pacotes&editar=${p.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">{p.nome} {!p.ativo && <Etiqueta tom="erro">Inativo</Etiqueta>}</p>
                <p className="text-sm font-semibold">{formatarReais(p.preco_centavos)}</p>
              </div>
              <p className="mt-1 text-xs text-suave">
                {itensDo(p.id).map((i) => `${i.quantidade}× ${nomeServico.get(i.servico_id) ?? "?"}`).join(" · ")}
                {" · "}validade {p.validade_dias} dias
              </p>
            </Linha>
          ))}
        </Grupo>
      )}
    </>
  );
}

// ------------------------------------------------------------ Categorias

export function AbaCategorias({ dados, ehDono, editar }: PropsAba) {
  const emEdicao = dados.categorias.find((c) => c.id === editar);
  const formAberto = editar === "novo" || Boolean(emEdicao);
  const contar = (c: Categoria) =>
    c.tipo === "servico"
      ? dados.servicos.filter((s) => s.categoria_id === c.id).length
      : dados.produtos.filter((p) => p.categoria_id === c.id).length;

  return (
    <>
      <Cabecalho texto="Organize serviços e produtos em categorias." aba="categorias" rotuloNovo="Nova categoria" ehDono={ehDono} formAberto={formAberto} />

      {ehDono && formAberto && (
        <PainelForm titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Nova categoria"} aba="categorias" acao={salvarCategoria} chave={editar!}>
          <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
          <Campo rotulo="Nome">
            <input name="nome" required defaultValue={emEdicao?.nome} className={classeInput} />
          </Campo>
          <Campo rotulo="Tipo" dica={emEdicao ? "O tipo não pode ser alterado depois de criado." : undefined}>
            <select name="tipo" required disabled={Boolean(emEdicao)} defaultValue={emEdicao?.tipo ?? ""} className={classeInput}>
              <option value="" disabled>Escolha…</option>
              <option value="servico">Serviços</option>
              <option value="produto">Produtos</option>
            </select>
          </Campo>
          <CaixaAtivo ativo={emEdicao?.ativo} rotulo="Ativa (aparece nos cadastros)" />
        </PainelForm>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(["servico", "produto"] as const).map((tipo) => {
          const lista = dados.categorias.filter((c) => c.tipo === tipo);
          return (
            <Grupo key={tipo} titulo={tipo === "servico" ? "Categorias de serviços" : "Categorias de produtos"}>
              {lista.length === 0 && <li className="px-4 py-3 text-sm text-suave">Nenhuma ainda.</li>}
              {lista.map((c) => (
                <Linha key={c.id} inativo={!c.ativo} ehDono={ehDono} nome={c.nome} editarHref={`/servicos?aba=categorias&editar=${c.id}`}>
                  <p className="font-medium">{c.nome} {!c.ativo && <Etiqueta tom="erro">Inativa</Etiqueta>}</p>
                  <p className="text-xs text-suave">{contar(c)} {tipo === "servico" ? "serviço(s)" : "produto(s)"}</p>
                </Linha>
              ))}
            </Grupo>
          );
        })}
      </div>
    </>
  );
}
