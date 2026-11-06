// Contas da Gestão financeira. Dinheiro sempre em centavos.
// Resultado (lucro): vendas, taxas e comissões pelo dia do atendimento; lançamentos pelo vencimento.
// Dinheiro disponível: pelo dia em que entrou ou saiu, desde a data de início do controle.

export type Grupo =
  | "receita" | "custo_variavel" | "despesa_fixa" | "investimento"
  | "receita_nao_operacional" | "despesa_nao_operacional";

export const GRUPOS: { id: Grupo; rotulo: string; dica: string }[] = [
  { id: "receita", rotulo: "Receitas", dica: "Entradas do salão além das comandas" },
  { id: "custo_variavel", rotulo: "Custos variáveis", dica: "Sobem e descem com as vendas, como produtos usados" },
  { id: "despesa_fixa", rotulo: "Despesas fixas", dica: "Existem mesmo sem vendas, como aluguel e energia" },
  { id: "investimento", rotulo: "Investimentos", dica: "Compras para o futuro, como equipamentos e reforma" },
  { id: "receita_nao_operacional", rotulo: "Receitas não operacionais", dica: "Entradas de fora do atendimento, como rendimentos" },
  { id: "despesa_nao_operacional", rotulo: "Despesas não operacionais", dica: "Saídas de fora da operação, como juros e multas" },
];

export const ehReceita = (g: Grupo) => g === "receita" || g === "receita_nao_operacional";

export type Categoria = { id: string; nome: string; grupo: Grupo; ativo: boolean };
export type Conta = { id: string; nome: string; saldo_inicial_centavos: number; ativo: boolean };
export type Lancamento = {
  id: string; categoria_id: string; conta_id: string | null; descricao: string | null;
  /** Visão: quanto se espera pagar ou receber */
  valor_centavos: number;
  /** Realidade: quanto foi de fato (vazio = ainda não informado) */
  valor_real_centavos: number | null;
  vencimento: string; pagamento: string | null; repeticao_id: string | null;
};
export type Automatico = {
  mes: string; faturamento: number; taxas: number; comissoes: number;
  recebido: number; taxas_caixa: number; pago_profissionais: number;
};
export type Posicao = { inicio: string | null; saldo: number; clientes_devendo: number; comissoes_a_pagar: number };
export type Meta = { id: string; ano: number; meta_vendas_centavos: number; lucro_desejado_percentual: number };

/** O que vale nas contas: a Realidade, quando informada; senão, a Visão. */
export const valorEfetivo = (l: Pick<Lancamento, "valor_centavos" | "valor_real_centavos">) => l.valor_real_centavos ?? l.valor_centavos;

export type Status = "pago" | "aguardando" | "atrasado";

export function statusDe(l: Pick<Lancamento, "pagamento" | "vencimento">, hoje: string): Status {
  if (l.pagamento) return "pago";
  return l.vencimento < hoje ? "atrasado" : "aguardando";
}

export type Resultado = {
  vendas: number; outrasReceitas: number; receita: number;
  comissoes: number; taxas: number; custosManuais: number; custos: number; margem: number;
  fixas: number; antesInvestimentos: number; investimentos: number; operacional: number;
  receitasNao: number; despesasNao: number; liquido: number;
  totalReceitas: number; totalDespesas: number;
};

/** Monta o resultado de um conjunto de lançamentos e dos automáticos do mesmo período. */
export function calcularResultado(lancamentos: Lancamento[], automaticos: Automatico[], categorias: Categoria[]): Resultado {
  const grupoDe = new Map(categorias.map((c) => [c.id, c.grupo]));
  const soma: Record<Grupo, number> = {
    receita: 0, custo_variavel: 0, despesa_fixa: 0, investimento: 0, receita_nao_operacional: 0, despesa_nao_operacional: 0,
  };
  for (const l of lancamentos) {
    const g = grupoDe.get(l.categoria_id);
    if (g) soma[g] += valorEfetivo(l);
  }
  const vendas = automaticos.reduce((s, a) => s + a.faturamento, 0);
  const comissoes = automaticos.reduce((s, a) => s + a.comissoes, 0);
  const taxas = automaticos.reduce((s, a) => s + a.taxas, 0);
  const receita = vendas + soma.receita;
  const custos = comissoes + taxas + soma.custo_variavel;
  const margem = receita - custos;
  const antesInvestimentos = margem - soma.despesa_fixa;
  const operacional = antesInvestimentos - soma.investimento;
  return {
    vendas, outrasReceitas: soma.receita, receita, comissoes, taxas, custosManuais: soma.custo_variavel, custos, margem,
    fixas: soma.despesa_fixa, antesInvestimentos, investimentos: soma.investimento, operacional,
    receitasNao: soma.receita_nao_operacional, despesasNao: soma.despesa_nao_operacional,
    liquido: operacional + soma.receita_nao_operacional - soma.despesa_nao_operacional,
    totalReceitas: receita + soma.receita_nao_operacional,
    totalDespesas: custos + soma.despesa_fixa + soma.investimento + soma.despesa_nao_operacional,
  };
}

/** Dinheiro que entrou e saiu num mês ("2026-11"). */
export function caixaDoMes(mes: string, lancamentos: Lancamento[], automaticos: Automatico[], categorias: Categoria[], inicio: string | null) {
  if (!inicio) return { entradas: 0, saidas: 0 };
  const grupoDe = new Map(categorias.map((c) => [c.id, c.grupo]));
  const a = automaticos.find((x) => x.mes === mes);
  let entradas = a?.recebido ?? 0;
  let saidas = (a?.taxas_caixa ?? 0) + (a?.pago_profissionais ?? 0);
  for (const l of lancamentos) {
    if (!l.pagamento || !l.pagamento.startsWith(mes) || l.pagamento < inicio) continue;
    const g = grupoDe.get(l.categoria_id);
    if (!g) continue;
    if (ehReceita(g)) entradas += valorEfetivo(l);
    else saidas += valorEfetivo(l);
  }
  return { entradas, saidas };
}

export const mesesDoAno = (ano: number) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Maiores despesas: categorias somadas, mais comissões e taxas. */
export function maioresDespesas(lancamentos: Lancamento[], automaticos: Automatico[], categorias: Categoria[], quantos = 5) {
  const nomes = new Map(categorias.map((c) => [c.id, c]));
  const totais = new Map<string, number>();
  for (const l of lancamentos) {
    const c = nomes.get(l.categoria_id);
    if (c && !ehReceita(c.grupo)) totais.set(c.nome, (totais.get(c.nome) ?? 0) + valorEfetivo(l));
  }
  totais.set("Comissões", automaticos.reduce((s, a) => s + a.comissoes, 0));
  totais.set("Taxas da maquininha", automaticos.reduce((s, a) => s + a.taxas, 0));
  return [...totais.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, quantos)
    .map(([nome, valor]) => ({ nome, valor }));
}

/** Meta do ano: lucro esperado e orçamento (o que pode gastar para chegar nesse lucro). */
export function contasDaMeta(meta: Pick<Meta, "meta_vendas_centavos" | "lucro_desejado_percentual">) {
  const lucroEsperado = Math.round(meta.meta_vendas_centavos * Number(meta.lucro_desejado_percentual) / 100);
  return { lucroEsperado, orcamento: meta.meta_vendas_centavos - lucroEsperado };
}

/** Percentual inteiro; sem total, 0 (em vez de dividir por zero). */
export function porcentagem(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Mesma data N meses depois; sem esse dia no mês, usa o último (31/01 + 1 → 28/02). */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
