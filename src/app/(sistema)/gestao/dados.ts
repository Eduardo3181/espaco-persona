import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Automatico, Categoria, Conta, Lancamento, Meta, Posicao } from "@/lib/gestao";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

export async function buscarCadastros(supabase: Supabase) {
  const [{ data: categorias }, { data: contas }] = await Promise.all([
    supabase.from("fin_categorias").select("id, nome, grupo, ativo").order("nome"),
    supabase.from("fin_contas").select("id, nome, saldo_inicial_centavos, ativo").order("nome"),
  ]);
  return { categorias: (categorias ?? []) as Categoria[], contas: (contas ?? []) as Conta[] };
}

const CAMPOS = "id, categoria_id, conta_id, descricao, valor_centavos, valor_real_centavos, vencimento, pagamento, repeticao_id, repeticao_tipo, parcela_numero, parcelas_total";

/** Lançamentos com vencimento ou pagamento no período, mais tudo o que está em aberto. */
export async function buscarLancamentosDoPeriodo(supabase: Supabase, inicio: string, fim: string) {
  const { data } = await supabase.from("fin_lancamentos").select(CAMPOS)
    .or(`and(vencimento.gte.${inicio},vencimento.lte.${fim}),and(pagamento.gte.${inicio},pagamento.lte.${fim}),pagamento.is.null`)
    .order("vencimento");
  return (data ?? []) as Lancamento[];
}

export async function buscarAutomaticos(supabase: Supabase, inicio: string, fim: string) {
  const { data } = await supabase.rpc("gestao_automaticos", { p_inicio: inicio, p_fim: fim });
  return (data ?? []) as Automatico[];
}

export async function buscarPosicao(supabase: Supabase, dia: string) {
  const { data } = await supabase.rpc("gestao_posicao", { p_data: dia });
  return (data ?? { inicio: null, saldo: 0, clientes_devendo: 0, comissoes_a_pagar: 0 }) as Posicao;
}

export async function buscarMeta(supabase: Supabase, ano: number) {
  const { data } = await supabase.from("fin_metas").select("*").eq("ano", ano).maybeSingle();
  return data as Meta | null;
}
