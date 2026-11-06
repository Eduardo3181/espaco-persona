"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeISO, lerPercentual, reaisParaCentavos } from "@/lib/formato";
import { dataValida } from "@/lib/agenda";
import { GRUPOS, somarMeses, type Grupo } from "@/lib/gestao";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();

function concluir(destino: string): never {
  revalidatePath("/gestao");
  redirect(destino.startsWith("/gestao") ? destino : "/gestao");
}

// ---------------------------------------------------------------- Lançamentos

export async function salvarLancamento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const categoria_id = texto(dados, "categoria_id");
  const valor_centavos = reaisParaCentavos(texto(dados, "valor"));
  const vencimento = texto(dados, "vencimento");
  const pagamento = texto(dados, "pagamento") || null;
  const repetir = Number(texto(dados, "repetir") || "1");

  if (!categoria_id) return { erro: "Escolha a categoria." };
  if (!valor_centavos) return { erro: "Valor inválido. Use o formato 120,00." };
  if (!dataValida(vencimento)) return { erro: "Informe a data de vencimento." };
  if (pagamento && !dataValida(pagamento)) return { erro: "Data de pagamento inválida." };
  if (pagamento && pagamento > hojeISO()) return { erro: "A data de pagamento não pode ser no futuro." };
  if (!Number.isInteger(repetir) || repetir < 1 || repetir > 36) return { erro: "Número de meses inválido." };

  const registro = {
    categoria_id, conta_id: texto(dados, "conta_id") || null, descricao: texto(dados, "descricao") || null,
    valor_centavos, vencimento, pagamento,
  };
  const supabase = await criarClienteServidor();
  if (id) {
    const { error } = await supabase.from("fin_lancamentos").update(registro).eq("id", id);
    if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  } else {
    // Conta que se repete: as próximas parcelas nascem em aberto
    const repeticao_id = repetir > 1 ? crypto.randomUUID() : null;
    const linhas = Array.from({ length: repetir }, (_, i) => ({
      ...registro, repeticao_id, vencimento: somarMeses(vencimento, i), pagamento: i === 0 ? pagamento : null,
    }));
    const { error } = await supabase.from("fin_lancamentos").insert(linhas);
    if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  }
  concluir(texto(dados, "volta"));
}

export async function marcarPago(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fin_lancamentos").update({ pagamento: hojeISO() }).eq("id", texto(dados, "id"));
  if (error) return { erro: "Não foi possível registrar o pagamento." };
  concluir(texto(dados, "volta"));
}

export async function desfazerPago(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fin_lancamentos").update({ pagamento: null }).eq("id", texto(dados, "id"));
  if (error) return { erro: "Não foi possível desfazer." };
  concluir(texto(dados, "volta"));
}

export async function excluirLancamento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const supabase = await criarClienteServidor();
  const repeticao = texto(dados, "repeticao_id");
  // "Este e os próximos": só os que ainda não foram pagos
  const consulta = repeticao
    ? supabase.from("fin_lancamentos").delete().eq("repeticao_id", repeticao).gte("vencimento", texto(dados, "vencimento")).is("pagamento", null)
    : supabase.from("fin_lancamentos").delete().eq("id", texto(dados, "id"));
  const { error } = await consulta;
  if (error) return { erro: "Não foi possível excluir." };
  concluir(texto(dados, "volta"));
}

// ---------------------------------------------------------------- Plano de contas

export async function salvarCategoria(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const grupo = texto(dados, "grupo") as Grupo;
  if (!nome) return { erro: "Informe o nome da categoria." };
  if (!GRUPOS.some((g) => g.id === grupo)) return { erro: "Escolha o grupo." };

  const supabase = await criarClienteServidor();
  const registro = { nome, grupo, ativo: dados.get("ativo") === "on" };
  const { error } = id
    ? await supabase.from("fin_categorias").update(registro).eq("id", id)
    : await supabase.from("fin_categorias").insert(registro);
  if (error) return { erro: error.message.includes("fin_categorias_nome_unico") ? "Já existe essa categoria neste grupo." : "Não foi possível salvar." };
  concluir("/gestao?aba=plano");
}

export async function salvarConta(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const bruto = texto(dados, "saldo") || "0";
  const negativo = bruto.startsWith("-");
  const centavos = reaisParaCentavos(negativo ? bruto.slice(1) : bruto);
  if (!nome) return { erro: "Informe o nome da conta." };
  if (centavos === null) return { erro: "Saldo inválido. Use o formato 1.200,00 (ou -300,00 se estiver negativo)." };

  const supabase = await criarClienteServidor();
  const registro = { nome, saldo_inicial_centavos: negativo ? -centavos : centavos, ativo: dados.get("ativo") === "on" };
  const { error } = id
    ? await supabase.from("fin_contas").update(registro).eq("id", id)
    : await supabase.from("fin_contas").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe uma conta com esse nome." : "Não foi possível salvar." };
  concluir("/gestao?aba=plano");
}

export async function salvarInicio(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const inicio = texto(dados, "inicio");
  if (!dataValida(inicio)) return { erro: "Informe a data de início." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("configuracoes").update({ fin_data_inicio: inicio }).eq("id", true);
  if (error) return { erro: "Não foi possível salvar a data." };
  concluir("/gestao?aba=plano");
}

// ---------------------------------------------------------------- Metas

export async function salvarMeta(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const ano = Number(texto(dados, "ano"));
  const meta_vendas_centavos = reaisParaCentavos(texto(dados, "meta"));
  const lucro_desejado_percentual = lerPercentual(texto(dados, "lucro"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return { erro: "Ano inválido." };
  if (!meta_vendas_centavos) return { erro: "Meta de vendas inválida. Use o formato 95.000,00." };
  if (lucro_desejado_percentual === null || Number.isNaN(lucro_desejado_percentual)) return { erro: "Lucro desejado inválido (0 a 100)." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fin_metas")
    .upsert({ ano, meta_vendas_centavos, lucro_desejado_percentual }, { onConflict: "ano" });
  if (error) return { erro: "Não foi possível salvar a meta." };
  concluir("/gestao?aba=metas");
}
