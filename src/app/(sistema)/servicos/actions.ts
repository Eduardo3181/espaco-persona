"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPercentual, reaisParaCentavos } from "@/lib/formato";
import type { EstadoForm } from "@/components/formulario";
import type { RegraComissao } from "@/lib/comissao";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();

function inteiro(valor: string): number | null {
  if (!/^-?\d+$/.test(valor)) return null;
  return Number(valor);
}

function mensagemErro(msg: string) {
  if (msg.includes("categorias_nome_unico")) return "Já existe uma categoria com esse nome.";
  if (msg.includes("violates foreign key")) return "Este item está sendo usado em outro cadastro.";
  return "Não foi possível salvar. Tente de novo.";
}

function concluir(aba: string): never {
  revalidatePath("/", "layout");
  redirect(`/servicos?aba=${aba}`);
}

// ---------------------------------------------------------------- Serviços

export async function salvarServico(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const categoria_id = texto(dados, "categoria_id");
  const duracao_min = inteiro(texto(dados, "duracao_min"));
  const preco_centavos = reaisParaCentavos(texto(dados, "preco"));

  if (!nome) return { erro: "Informe o nome do serviço." };
  if (!categoria_id) return { erro: "Escolha uma categoria." };
  if (!duracao_min || duracao_min <= 0 || duracao_min > 720) return { erro: "Duração inválida (em minutos, ex.: 45)." };
  if (preco_centavos === null) return { erro: "Valor inválido. Use o formato 120,00." };

  // Comissão de cada profissional para este serviço (vazio = herda categoria/padrão)
  const comissoes: { profissional_id: string; percentual: number | null }[] = [];
  for (const [campo, valor] of dados.entries()) {
    if (!campo.startsWith("comissao_")) continue;
    const percentual = lerPercentual(String(valor));
    if (Number.isNaN(percentual)) return { erro: "Comissão inválida: use um número entre 0 e 100." };
    comissoes.push({ profissional_id: campo.slice("comissao_".length), percentual });
  }

  const supabase = await criarClienteServidor();
  const registro = { nome, categoria_id, duracao_min, preco_centavos, ativo: dados.get("ativo") === "on" };
  const { data: salvo, error } = id
    ? await supabase.from("servicos").update(registro).eq("id", id).select("id").single()
    : await supabase.from("servicos").insert(registro).select("id").single();
  if (error || !salvo) return { erro: mensagemErro(error?.message ?? "") };

  const { data: existentes } = await supabase
    .from("regras_comissao")
    .select("*")
    .eq("tipo", "servico")
    .eq("servico_id", salvo.id);

  for (const c of comissoes) {
    const atual = (existentes as RegraComissao[] | null)?.find((r) => r.profissional_id === c.profissional_id);
    let resultado;
    if (c.percentual === null) {
      if (atual) resultado = await supabase.from("regras_comissao").delete().eq("id", atual.id);
    } else if (!atual) {
      resultado = await supabase.from("regras_comissao").insert({
        profissional_id: c.profissional_id, tipo: "servico", servico_id: salvo.id, percentual: c.percentual,
      });
    } else if (Number(atual.percentual) !== c.percentual) {
      resultado = await supabase.from("regras_comissao").update({ percentual: c.percentual }).eq("id", atual.id);
    }
    if (resultado?.error) return { erro: "O serviço foi salvo, mas houve erro ao gravar a comissão. Tente de novo." };
  }

  concluir("servicos");
}

// ---------------------------------------------------------------- Produtos

export async function salvarProduto(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const categoria_id = texto(dados, "categoria_id");
  const preco_centavos = reaisParaCentavos(texto(dados, "preco"));
  const estoque = inteiro(texto(dados, "estoque") || "0");
  const estoque_minimo = inteiro(texto(dados, "estoque_minimo") || "0");
  const comissao_percentual = lerPercentual(texto(dados, "comissao_percentual"));

  if (!nome) return { erro: "Informe o nome do produto." };
  if (!categoria_id) return { erro: "Escolha uma categoria." };
  if (preco_centavos === null) return { erro: "Preço inválido. Use o formato 89,90." };
  if (estoque === null) return { erro: "Estoque deve ser um número inteiro." };
  if (estoque_minimo === null || estoque_minimo < 0) return { erro: "Estoque mínimo deve ser um número inteiro." };
  if (comissao_percentual === null || Number.isNaN(comissao_percentual)) return { erro: "Comissão de venda inválida (0 a 100)." };

  const supabase = await criarClienteServidor();
  const registro = { nome, categoria_id, preco_centavos, estoque, estoque_minimo, comissao_percentual, ativo: dados.get("ativo") === "on" };
  const { error } = id
    ? await supabase.from("produtos").update(registro).eq("id", id)
    : await supabase.from("produtos").insert(registro);
  if (error) return { erro: mensagemErro(error.message) };

  concluir("produtos");
}

// ---------------------------------------------------------------- Pacotes

export async function salvarPacote(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const validade_dias = inteiro(texto(dados, "validade_dias"));
  const preco_centavos = reaisParaCentavos(texto(dados, "preco"));

  if (!nome) return { erro: "Informe o nome do pacote." };
  if (!validade_dias || validade_dias <= 0) return { erro: "Validade inválida (em dias, ex.: 60)." };
  if (preco_centavos === null) return { erro: "Preço inválido. Use o formato 240,00." };

  const itens: { servico_id: string; quantidade: number }[] = [];
  for (const [campo, valor] of dados.entries()) {
    if (!campo.startsWith("qtd_") || !String(valor).trim()) continue;
    const quantidade = inteiro(String(valor).trim());
    if (quantidade === null || quantidade < 0) return { erro: "Quantidades devem ser números inteiros." };
    if (quantidade > 0) itens.push({ servico_id: campo.slice(4), quantidade });
  }
  if (!itens.length) return { erro: "Inclua pelo menos um serviço no pacote." };

  const supabase = await criarClienteServidor();
  const registro = { nome, validade_dias, preco_centavos, ativo: dados.get("ativo") === "on" };
  const { data: salvo, error } = id
    ? await supabase.from("pacotes").update(registro).eq("id", id).select("id").single()
    : await supabase.from("pacotes").insert(registro).select("id").single();
  if (error || !salvo) return { erro: mensagemErro(error?.message ?? "") };

  const { error: erroApagar } = await supabase.from("pacote_servicos").delete().eq("pacote_id", salvo.id);
  if (erroApagar) return { erro: "Não foi possível atualizar os serviços do pacote." };
  const { error: erroItens } = await supabase
    .from("pacote_servicos")
    .insert(itens.map((i) => ({ ...i, pacote_id: salvo.id })));
  if (erroItens) return { erro: "Não foi possível gravar os serviços do pacote. Abra o pacote e salve de novo." };

  concluir("pacotes");
}

// ---------------------------------------------------------------- Categorias

export async function salvarCategoria(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const tipo = texto(dados, "tipo");
  if (!nome) return { erro: "Informe o nome da categoria." };
  if (!id && tipo !== "servico" && tipo !== "produto") return { erro: "Escolha se é categoria de serviço ou de produto." };

  const supabase = await criarClienteServidor();
  const ativo = dados.get("ativo") === "on";
  const { error } = id
    ? await supabase.from("categorias").update({ nome, ativo }).eq("id", id)
    : await supabase.from("categorias").insert({ nome, tipo, ativo });
  if (error) return { erro: mensagemErro(error.message) };

  concluir("categorias");
}
