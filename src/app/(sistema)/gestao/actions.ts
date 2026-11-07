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
  const textoReal = texto(dados, "valor_real");
  const valor_real_centavos = textoReal ? reaisParaCentavos(textoReal) : null;
  const repeticao = texto(dados, "repeticao") || "unica";
  const parcelasTotal = Number(texto(dados, "parcelas_total"));
  const parcelaAtual = Number(texto(dados, "parcela_atual"));

  if (!categoria_id) return { erro: "Escolha a categoria." };
  if (!valor_centavos) return { erro: "Visão inválida. Use o formato 120,00." };
  if (textoReal && valor_real_centavos === null) return { erro: "Realidade inválida. Use o formato 120,00." };
  if (!dataValida(vencimento)) return { erro: "Informe a data de vencimento." };
  if (pagamento && !dataValida(pagamento)) return { erro: "Data de pagamento inválida." };
  if (pagamento && pagamento > hojeISO()) return { erro: "A data de pagamento não pode ser no futuro." };
  if (repeticao === "parcelada") {
    if (!Number.isInteger(parcelasTotal) || parcelasTotal < 2 || parcelasTotal > 120) return { erro: "Número de parcelas inválido (de 2 a 120)." };
    if (!Number.isInteger(parcelaAtual) || parcelaAtual < 1 || parcelaAtual > parcelasTotal) return { erro: "A parcela atual precisa estar entre 1 e o número de parcelas." };
  }

  const registro = {
    categoria_id, conta_id: texto(dados, "conta_id") || null, descricao: texto(dados, "descricao") || null,
    valor_centavos, valor_real_centavos, vencimento, pagamento,
  };
  const supabase = await criarClienteServidor();
  const serie = repeticao === "recorrente" || repeticao === "parcelada"
    ? {
        repeticao_id: crypto.randomUUID(), repeticao_tipo: repeticao,
        parcela_numero: repeticao === "parcelada" ? parcelaAtual : null,
        parcelas_total: repeticao === "parcelada" ? parcelasTotal : null,
      }
    : null;

  let eraDeSerie = false;
  if (id) {
    const { data: atual } = await supabase.from("fin_lancamentos").select("repeticao_id").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Este lançamento não existe mais." };
    eraDeSerie = Boolean(atual.repeticao_id);
    const { error } = await supabase.from("fin_lancamentos")
      .update(atual.repeticao_id ? registro : { ...registro, ...serie }).eq("id", id);
    if (error) return { erro: "Não foi possível salvar. Tente de novo." };
    if (atual.repeticao_id && dados.get("aplicar_proximos") === "on") {
      const { error: erroProximos } = await supabase.from("fin_lancamentos")
        .update({ categoria_id, conta_id: registro.conta_id, descricao: registro.descricao, valor_centavos })
        .eq("repeticao_id", atual.repeticao_id).gt("vencimento", vencimento).is("pagamento", null);
      if (erroProximos) return { erro: "Este mês foi salvo, mas não foi possível atualizar os próximos." };
    }
  } else {
    const { error } = await supabase.from("fin_lancamentos").insert({ ...registro, ...serie });
    if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  }

  // As próximas parcelas ou meses nascem em aberto, cada um no seu mês
  if (serie && !eraDeSerie) {
    const base = { categoria_id, conta_id: registro.conta_id, descricao: registro.descricao, valor_centavos, ...serie };
    const proximas: (typeof base & { vencimento: string })[] = [];
    if (repeticao === "parcelada") {
      for (let i = 1; parcelaAtual + i <= parcelasTotal; i++) {
        proximas.push({ ...base, vencimento: somarMeses(vencimento, i), parcela_numero: parcelaAtual + i });
      }
    } else {
      const limite = somarMeses(hojeISO(), 12);
      for (let i = 1; somarMeses(vencimento, i) <= limite; i++) proximas.push({ ...base, vencimento: somarMeses(vencimento, i) });
      // A mesma conta já lançada num desses meses entra na recorrência, sem duplicar
      const consulta = supabase.from("fin_lancamentos").select("id, vencimento")
        .eq("categoria_id", categoria_id).is("repeticao_id", null).gt("vencimento", vencimento);
      const { data: iguais } = await (registro.descricao ? consulta.eq("descricao", registro.descricao) : consulta.is("descricao", null));
      const mesesIguais = new Set((iguais ?? []).map((l) => l.vencimento.slice(0, 7)));
      const ligar = (iguais ?? []).map((l) => l.id);
      if (ligar.length) {
        const { error } = await supabase.from("fin_lancamentos")
          .update({ repeticao_id: serie.repeticao_id, repeticao_tipo: "recorrente" }).in("id", ligar);
        if (error) return { erro: "Não foi possível ligar as contas já lançadas." };
      }
      for (let i = proximas.length - 1; i >= 0; i--) {
        if (mesesIguais.has(proximas[i].vencimento.slice(0, 7))) proximas.splice(i, 1);
      }
    }
    if (proximas.length) {
      const { error } = await supabase.from("fin_lancamentos").insert(proximas);
      if (error) return { erro: "Esta conta foi salva, mas não foi possível lançar os próximos meses." };
    }
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
  const id = texto(dados, "id");
  const supabase = await criarClienteServidor();
  if (texto(dados, "escopo") === "proximos") {
    // "Este e os próximos": só os que ainda não foram pagos; a recorrência para de criar novos meses
    const { data: atual } = await supabase.from("fin_lancamentos").select("repeticao_id, vencimento").eq("id", id).maybeSingle();
    if (!atual?.repeticao_id) return { erro: "Este lançamento não existe mais." };
    const { error } = await supabase.from("fin_lancamentos").delete()
      .eq("repeticao_id", atual.repeticao_id).gte("vencimento", atual.vencimento).is("pagamento", null);
    if (error) return { erro: "Não foi possível excluir." };
    const { error: erroEncerrar } = await supabase.from("fin_lancamentos")
      .update({ repeticao_encerrada: true }).eq("repeticao_id", atual.repeticao_id);
    if (erroEncerrar) return { erro: "Não foi possível encerrar a recorrência." };
  } else {
    const { error } = await supabase.from("fin_lancamentos").delete().eq("id", id);
    if (error) return { erro: "Não foi possível excluir." };
  }
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
