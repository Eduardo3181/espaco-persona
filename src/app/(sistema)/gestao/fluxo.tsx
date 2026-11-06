import Link from "next/link";
import { formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import { somarDias } from "@/lib/agenda";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  GRUPOS, MESES_CURTOS, caixaDoMes, calcularResultado, ehReceita, mesesDoAno, valorEfetivo, type Categoria, type Lancamento,
} from "@/lib/gestao";
import { buscarAutomaticos, buscarCadastros, buscarLancamentosDoPeriodo, buscarPosicao } from "./dados";
import { AvisoInicio, SeletorAno } from "./painel";

const valorCurto = (c: number) => (c === 0 ? "–" : formatarReais(c).replace("R$", "").trim());

type Linha = { rotulo: string; valores: number[]; total?: number | null; destaque?: "total" | "titulo" };

function Tabela({ linhas }: { linhas: Linha[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-borda bg-cartao">
      <table className="w-full min-w-[60rem] text-right text-sm">
        <thead className="bg-escuro text-xs text-sobre-escuro">
          <tr>
            <th className="sticky left-0 bg-escuro px-3 py-2 text-left font-semibold">R$</th>
            {MESES_CURTOS.map((m) => <th key={m} className="px-2 py-2 font-semibold">{m}</th>)}
            <th className="px-3 py-2 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((l) => (
            <tr key={l.rotulo} className={l.destaque === "total" ? "bg-fundo font-semibold" : l.destaque === "titulo" ? "text-xs font-semibold uppercase tracking-wide text-rose" : ""}>
              <th scope="row" className={`sticky left-0 max-w-52 truncate px-3 py-1.5 text-left font-[inherit] ${l.destaque === "total" ? "bg-fundo" : "bg-cartao"}`} title={l.rotulo}>{l.rotulo}</th>
              {l.destaque === "titulo"
                ? <td colSpan={13} />
                : (
                  <>
                    {l.valores.map((v, i) => <td key={i} className={`whitespace-nowrap px-2 py-1.5 ${v < 0 ? "text-erro" : ""}`}>{valorCurto(v)}</td>)}
                    <td className="whitespace-nowrap px-3 py-1.5 font-semibold">{l.total === null ? "" : valorCurto(l.total ?? l.valores.reduce((s, v) => s + v, 0))}</td>
                  </>
                )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function AbaFluxo({ ano, visao }: { ano: number; visao: "geral" | "analitico" }) {
  const hoje = hojeISO();
  const inicioAno = `${ano}-01-01`;
  const fimAno = `${ano}-12-31`;
  const supabase = await criarClienteServidor();
  const [{ categorias }, lancamentos, automaticos, abertura] = await Promise.all([
    buscarCadastros(supabase),
    buscarLancamentosDoPeriodo(supabase, inicioAno, fimAno),
    buscarAutomaticos(supabase, inicioAno, fimAno),
    buscarPosicao(supabase, somarDias(inicioAno, -1)),
  ]);
  const meses = mesesDoAno(ano);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorAno ano={ano} base={`/gestao?aba=fluxo&visao=${visao}`} />
        <nav className="flex gap-1 rounded-lg border border-borda bg-cartao p-1" aria-label="Visão">
          {([["geral", "Visão geral"], ["analitico", "Por categoria"]] as const).map(([v, rot]) => (
            <Link key={v} href={`/gestao?aba=fluxo&visao=${v}&ano=${ano}`} aria-current={visao === v ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-md px-3 text-sm font-semibold ${visao === v ? "bg-escuro text-sobre-escuro" : "text-suave hover:text-texto"}`}>
              {rot}
            </Link>
          ))}
        </nav>
      </div>
      {!abertura.inicio && visao === "geral" && <AvisoInicio />}
      {visao === "geral"
        ? <VisaoGeral meses={meses} lancamentos={lancamentos} categorias={categorias} automaticos={automaticos} inicio={abertura.inicio} saldoAbertura={abertura.saldo} hoje={hoje} />
        : <PorCategoria meses={meses} lancamentos={lancamentos.filter((l) => l.vencimento >= inicioAno && l.vencimento <= fimAno)} categorias={categorias} automaticos={automaticos} />}
    </div>
  );
}

function VisaoGeral({ meses, lancamentos, categorias, automaticos, inicio, saldoAbertura, hoje }: {
  meses: string[]; lancamentos: Lancamento[]; categorias: Categoria[]; automaticos: Parameters<typeof caixaDoMes>[2];
  inicio: string | null; saldoAbertura: number; hoje: string;
}) {
  const caixa = meses.map((m) => caixaDoMes(m, lancamentos, automaticos, categorias, inicio));
  let corrente = saldoAbertura;
  const iniciais: number[] = [];
  const finais: number[] = [];
  for (const c of caixa) {
    iniciais.push(corrente);
    corrente += c.entradas - c.saidas;
    finais.push(corrente);
  }
  const grupoDe = new Map(categorias.map((c) => [c.id, c.grupo]));
  const emAberto = (receita: boolean) => meses.map((m) => lancamentos
    .filter((l) => !l.pagamento && l.vencimento.startsWith(m) && ehReceita(grupoDe.get(l.categoria_id) ?? "despesa_fixa") === receita)
    .reduce((s, l) => s + valorEfetivo(l), 0));
  const aReceber = emAberto(true);
  const aPagar = emAberto(false);

  return (
    <>
      <Tabela linhas={[
        { rotulo: "Dinheiro que entrou e saiu", valores: [], destaque: "titulo" },
        { rotulo: "Saldo no começo do mês", valores: iniciais, total: null },
        { rotulo: "Entradas", valores: caixa.map((c) => c.entradas) },
        { rotulo: "Saídas", valores: caixa.map((c) => c.saidas) },
        { rotulo: "Saldo no fim do mês", valores: finais, total: finais.at(-1) ?? 0, destaque: "total" },
        { rotulo: "Contas ainda em aberto", valores: [], destaque: "titulo" },
        { rotulo: "A receber", valores: aReceber },
        { rotulo: "A pagar", valores: aPagar },
        { rotulo: "Previsto (a receber − a pagar)", valores: aReceber.map((v, i) => v - aPagar[i]), destaque: "total" },
      ]} />
      <p className="text-xs text-suave">
        {inicio ? `Dinheiro contado desde ${formatarDiaISO(inicio)}. ` : ""}
        Cartão conta como recebido no dia do atendimento; comissões saem quando o pagamento é registrado. Hoje é {formatarDiaISO(hoje)}.
      </p>
    </>
  );
}

function PorCategoria({ meses, lancamentos, categorias, automaticos }: {
  meses: string[]; lancamentos: Lancamento[]; categorias: Categoria[]; automaticos: Parameters<typeof caixaDoMes>[2];
}) {
  const doMes = (m: string) => calcularResultado(lancamentos.filter((l) => l.vencimento.startsWith(m)), automaticos.filter((a) => a.mes === m), categorias);
  const resultados = meses.map(doMes);
  const porCategoria = (id: string) => meses.map((m) => lancamentos.filter((l) => l.categoria_id === id && l.vencimento.startsWith(m)).reduce((s, l) => s + valorEfetivo(l), 0));
  const linhasGrupo = (grupo: (typeof GRUPOS)[number]["id"]): Linha[] => categorias
    .filter((c) => c.grupo === grupo)
    .map((c) => ({ rotulo: c.nome, valores: porCategoria(c.id) }))
    .filter((l) => l.valores.some((v) => v !== 0));
  const coluna = (f: (r: (typeof resultados)[number]) => number) => resultados.map(f);

  return (
    <>
      <Tabela linhas={[
        { rotulo: "Vendas (comandas)", valores: coluna((r) => r.vendas) },
        ...linhasGrupo("receita"),
        { rotulo: "Total da receita", valores: coluna((r) => r.receita), destaque: "total" },
        { rotulo: "Comissões", valores: coluna((r) => r.comissoes) },
        { rotulo: "Taxas da maquininha", valores: coluna((r) => r.taxas) },
        ...linhasGrupo("custo_variavel"),
        { rotulo: "Margem de contribuição", valores: coluna((r) => r.margem), destaque: "total" },
        ...linhasGrupo("despesa_fixa"),
        { rotulo: "Lucro antes dos investimentos", valores: coluna((r) => r.antesInvestimentos), destaque: "total" },
        ...linhasGrupo("investimento"),
        { rotulo: "Lucro operacional", valores: coluna((r) => r.operacional), destaque: "total" },
        ...linhasGrupo("receita_nao_operacional"),
        ...linhasGrupo("despesa_nao_operacional"),
        { rotulo: "Resultado líquido", valores: coluna((r) => r.liquido), destaque: "total" },
      ]} />
      <p className="text-xs text-suave">Vendas, taxas e comissões pelo dia do atendimento; as outras contas pelo vencimento, mesmo ainda em aberto. Só aparecem categorias com valor no ano.</p>
    </>
  );
}
