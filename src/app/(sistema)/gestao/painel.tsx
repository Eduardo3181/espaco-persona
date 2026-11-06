import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Cartao } from "@/components/ui";
import { formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import { somarDias } from "@/lib/agenda";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  MESES_CURTOS, caixaDoMes, calcularResultado, contasDaMeta, ehReceita, maioresDespesas, mesesDoAno, porcentagem,
  statusDe, valorEfetivo, type Categoria, type Lancamento, type Resultado,
} from "@/lib/gestao";
import { ListaComBarra } from "../relatorios/graficos";
import { buscarAutomaticos, buscarCadastros, buscarLancamentosDoPeriodo, buscarMeta, buscarPosicao } from "./dados";
import { Anel, BarrasMensais, LinhaSaldo } from "./graficos";

export function SeletorAno({ ano, base }: { ano: number; base: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={`${base}&ano=${ano - 1}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Ano anterior"><ChevronLeft size={20} /></Link>
      <span className="font-titulo text-3xl font-bold">{ano}</span>
      <Link href={`${base}&ano=${ano + 1}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Próximo ano"><ChevronRight size={20} /></Link>
    </div>
  );
}

export function AvisoInicio() {
  return (
    <p className="rounded-lg border border-aguardando/40 bg-aguardando-fundo px-3 py-2 text-sm">
      Para ver o dinheiro disponível, informe o saldo de cada conta e a data de início em{" "}
      <Link href="/gestao?aba=plano" className="font-semibold text-rose underline">Plano de contas</Link>.
    </p>
  );
}

/** Quadro com o caminho da receita até o resultado líquido. */
export function linhasResultado(r: Resultado) {
  return [
    { rotulo: "Total da receita", valor: r.receita },
    { rotulo: "Custos variáveis", valor: r.custos, dica: "comissões, taxas e produtos" },
    { rotulo: "Margem de contribuição", valor: r.margem, total: true },
    { rotulo: "Despesas fixas", valor: r.fixas },
    { rotulo: "Lucro antes dos investimentos", valor: r.antesInvestimentos, total: true },
    { rotulo: "Investimentos", valor: r.investimentos },
    { rotulo: "Lucro operacional", valor: r.operacional, total: true },
    { rotulo: "Receitas não operacionais", valor: r.receitasNao },
    { rotulo: "Despesas não operacionais", valor: r.despesasNao },
    { rotulo: "Resultado líquido", valor: r.liquido, total: true },
  ];
}

function Indicador({ rotulo, valor, tom, dica }: { rotulo: string; valor: number; tom?: "sucesso" | "erro"; dica?: string }) {
  const cor = valor < 0 || tom === "erro" ? "text-erro" : tom === "sucesso" ? "text-sucesso" : "";
  return (
    <div className="rounded-xl border border-borda bg-cartao p-3">
      <p className="text-xs text-suave">{rotulo}</p>
      <p className={`mt-1 text-lg font-bold sm:text-xl ${cor}`}>{formatarReais(valor)}</p>
      {dica && <p className="text-[11px] text-suave">{dica}</p>}
    </div>
  );
}

function QuadroContas({ titulo, cor, hoje, noMes, atraso, extra }: {
  titulo: string; cor: string; hoje: number; noMes: number; atraso: number; extra: { rotulo: string; valor: number };
}) {
  return (
    <Cartao className="flex flex-col gap-2">
      <h3 className="font-semibold">{titulo}</h3>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-suave">Vence hoje</dt><dd className={`font-semibold ${cor}`}>{formatarReais(hoje)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-suave">Ainda neste mês</dt><dd className={`font-semibold ${cor}`}>{formatarReais(noMes)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-suave">Em atraso</dt><dd className={`font-semibold ${atraso > 0 ? "text-erro" : ""}`}>{formatarReais(atraso)}</dd></div>
        <div className="mt-1 flex justify-between gap-2 border-t border-borda pt-2"><dt className="text-suave">{extra.rotulo}</dt><dd className="font-semibold">{formatarReais(extra.valor)}</dd></div>
      </dl>
    </Cartao>
  );
}

function pendentes(lancamentos: Lancamento[], categorias: Categoria[], receita: boolean, hoje: string) {
  const grupoDe = new Map(categorias.map((c) => [c.id, c.grupo]));
  const abertos = lancamentos.filter((l) => {
    const g = grupoDe.get(l.categoria_id);
    return !l.pagamento && g && ehReceita(g) === receita;
  });
  const soma = (f: (l: Lancamento) => boolean) => abertos.filter(f).reduce((s, l) => s + valorEfetivo(l), 0);
  return {
    hoje: soma((l) => l.vencimento === hoje),
    noMes: soma((l) => l.vencimento >= hoje && l.vencimento.slice(0, 7) === hoje.slice(0, 7)),
    atraso: soma((l) => statusDe(l, hoje) === "atrasado"),
  };
}

export async function AbaPainel({ ano }: { ano: number }) {
  const hoje = hojeISO();
  const inicioAno = `${ano}-01-01`;
  const fimAno = `${ano}-12-31`;
  const supabase = await criarClienteServidor();
  const [{ categorias }, lancamentos, automaticos, agora, abertura, meta] = await Promise.all([
    buscarCadastros(supabase),
    buscarLancamentosDoPeriodo(supabase, inicioAno, fimAno),
    buscarAutomaticos(supabase, inicioAno, fimAno),
    buscarPosicao(supabase, hoje),
    buscarPosicao(supabase, somarDias(inicioAno, -1)),
    buscarMeta(supabase, ano),
  ]);

  // Contas futuras (como o aluguel de dezembro) só entram no resultado quando vencem
  const doAno = lancamentos.filter((l) => l.vencimento >= inicioAno && l.vencimento <= fimAno && (l.vencimento <= hoje || l.pagamento));
  const r = calcularResultado(doAno, automaticos, categorias);
  const receber = pendentes(lancamentos, categorias, true, hoje);
  const pagar = pendentes(lancamentos, categorias, false, hoje);
  const top = maioresDespesas(doAno, automaticos, categorias);

  const meses = mesesDoAno(ano);
  const inicio = agora.inicio;
  let corrente = abertura.saldo;
  const pontosSaldo: { rotulo: string; valor: number | null }[] = [];
  for (const [i, mes] of meses.entries()) {
    const { entradas, saidas } = caixaDoMes(mes, lancamentos, automaticos, categorias, inicio);
    corrente += entradas - saidas;
    const mostrar = inicio && mes >= inicio.slice(0, 7) && mes <= hoje.slice(0, 7);
    pontosSaldo.push({ rotulo: MESES_CURTOS[i], valor: mostrar ? corrente : null });
  }
  const barras = meses.map((mes, i) => {
    const m = calcularResultado(doAno.filter((l) => l.vencimento.startsWith(mes)), automaticos.filter((a) => a.mes === mes), categorias);
    return { rotulo: MESES_CURTOS[i], receita: m.totalReceitas, despesa: m.totalDespesas };
  });

  const contasMeta = meta ? contasDaMeta(meta) : null;
  const pctMeta = contasMeta ? porcentagem(r.receita, meta!.meta_vendas_centavos) : 0;
  const pctOrcamento = contasMeta ? porcentagem(r.totalDespesas, contasMeta.orcamento) : 0;

  return (
    <div className="flex flex-col gap-5">
      <SeletorAno ano={ano} base="/gestao?aba=painel" />
      {!inicio && <AvisoInicio />}

      <section aria-label="Números do ano" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Dinheiro disponível" valor={agora.saldo} dica={inicio ? `hoje, contando desde ${formatarDiaISO(inicio)}` : "falta informar o início"} />
        <Indicador rotulo="Total de receitas" valor={r.totalReceitas} tom="sucesso" />
        <Indicador rotulo="Total de despesas" valor={r.totalDespesas} tom="erro" />
        <Indicador rotulo="Lucro líquido" valor={r.liquido} dica={`lucratividade de ${porcentagem(r.liquido, r.totalReceitas)}%`} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Cartao>
          <h3 className="mb-2 font-semibold">Resultado de {ano}</h3>
          <ul className="text-sm">
            {linhasResultado(r).map((l) => (
              <li key={l.rotulo} className={`flex items-baseline justify-between gap-3 py-1.5 ${l.total ? "border-t border-borda font-semibold" : ""}`}>
                <span className="min-w-0">{l.rotulo}{l.dica && <span className="block text-xs font-normal text-suave">{l.dica}</span>}</span>
                <span className="flex shrink-0 gap-3">
                  <span className={l.valor < 0 ? "text-erro" : ""}>{formatarReais(l.valor)}</span>
                  <span className="w-9 text-right text-xs font-normal text-suave">{porcentagem(l.valor, r.receita)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <QuadroContas titulo="Contas a receber" cor="text-sucesso" {...receber} extra={{ rotulo: "Clientes devendo", valor: agora.clientes_devendo }} />
            <QuadroContas titulo="Contas a pagar" cor="text-erro" {...pagar} extra={{ rotulo: "Comissões a pagar", valor: agora.comissoes_a_pagar }} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Cartao className="text-center">
              <h3 className="mb-2 font-semibold">Meta de receitas</h3>
              {meta ? (
                <>
                  <Anel percentual={pctMeta} cor="receita" rotulo="Meta de receitas" />
                  <p className="mt-2 text-xs text-suave">{formatarReais(r.receita)} de {formatarReais(meta.meta_vendas_centavos)}</p>
                </>
              ) : <SemMeta ano={ano} />}
            </Cartao>
            <Cartao className="text-center">
              <h3 className="mb-2 font-semibold">Orçamento utilizado</h3>
              {contasMeta ? (
                <>
                  <Anel percentual={pctOrcamento} cor="despesa" rotulo="Orçamento utilizado" />
                  <p className={`mt-2 text-xs ${pctOrcamento > 100 ? "font-semibold text-erro" : "text-suave"}`}>
                    {formatarReais(r.totalDespesas)} de {formatarReais(contasMeta.orcamento)}{pctOrcamento > 100 && " · acima do orçamento"}
                  </p>
                </>
              ) : <SemMeta ano={ano} />}
            </Cartao>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao>
          <h3 className="mb-3 font-semibold">Dinheiro disponível mês a mês</h3>
          {inicio ? <LinhaSaldo pontos={pontosSaldo} /> : <p className="text-sm text-suave">Aparece depois de informar a data de início.</p>}
        </Cartao>
        <Cartao>
          <h3 className="mb-3 font-semibold">Receitas e despesas por mês</h3>
          <BarrasMensais meses={barras} />
        </Cartao>
      </div>

      <Cartao>
        <h3 className="mb-3 font-semibold">5 maiores despesas</h3>
        {top.length === 0
          ? <p className="text-sm text-suave">Nenhuma despesa neste ano.</p>
          : <ListaComBarra linhas={top.map((t) => ({ chave: t.nome, rotulo: t.nome, valor: t.valor }))} />}
      </Cartao>
    </div>
  );
}

function SemMeta({ ano }: { ano: number }) {
  return <p className="py-6 text-sm text-suave"><Link href="/gestao?aba=metas" className="font-semibold text-rose underline">Defina a meta de {ano}</Link> para acompanhar.</p>;
}
