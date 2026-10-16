"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono, exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { normalizarTelefone, reaisParaCentavos } from "@/lib/formato";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const textoOuNulo = (d: FormData, campo: string) => texto(d, campo) || null;

// ---------------------------------------------------------------- Cadastro

export async function salvarCliente(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome");
  const telefone = normalizarTelefone(texto(dados, "telefone"));
  const dia = Number(texto(dados, "aniversario_dia")) || null;
  const mes = Number(texto(dados, "aniversario_mes")) || null;
  const anoTexto = texto(dados, "aniversario_ano");
  const ano = anoTexto ? Number(anoTexto) : null;
  const clienteDesde = texto(dados, "cliente_desde");

  if (!nome) return { erro: "Informe o nome da cliente." };
  if (telefone && (telefone.length < 10 || telefone.length > 11)) return { erro: "Telefone inválido. Use DDD + número, ex.: (11) 98765-4321." };
  if ((dia === null) !== (mes === null)) return { erro: "No aniversário, preencha dia e mês." };
  if (dia && mes && dia > new Date(2024, mes, 0).getDate()) return { erro: "Dia de aniversário inválido para esse mês." };
  if (ano !== null && (!Number.isInteger(ano) || ano < 1900 || ano > new Date().getFullYear())) return { erro: "Ano de nascimento inválido." };
  if (ano !== null && !dia) return { erro: "Para informar o ano, preencha também dia e mês." };

  const registro: Record<string, unknown> = {
    nome,
    telefone: telefone || null,
    aniversario_dia: dia,
    aniversario_mes: mes,
    aniversario_ano: ano,
  };
  registro.cliente_desde = /^\d{4}-\d{2}-\d{2}$/.test(clienteDesde) ? clienteDesde : null;

  const supabase = await criarClienteServidor();
  const { data: salvo, error } = id
    ? await supabase.from("clientes").update(registro).eq("id", id).select("id").single()
    : await supabase.from("clientes").insert(registro).select("id").single();
  if (error || !salvo) return { erro: "Não foi possível salvar. Tente de novo." };

  revalidatePath("/clientes");
  redirect(`/clientes/${salvo.id}`);
}

/** Exclusão definitiva a pedido da cliente (LGPD). Apaga ficha, anotações e saldo. */
export async function excluirCliente(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const confirmacao = texto(dados, "confirmacao").toUpperCase();
  if (confirmacao !== "EXCLUIR") return { erro: "Para confirmar, digite EXCLUIR no campo." };

  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("clientes").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { erro: "Não foi possível excluir a cliente." };

  revalidatePath("/clientes");
  redirect("/clientes");
}

// ---------------------------------------------------------------- Ficha técnica

export async function salvarFicha(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const cliente_id = texto(dados, "cliente_id");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fichas_tecnicas").upsert({
    cliente_id,
    cor_formula: textoOuNulo(dados, "cor_formula"),
    tipo_cabelo: textoOuNulo(dados, "tipo_cabelo"),
    alergias_cuidados: textoOuNulo(dados, "alergias_cuidados"),
    preferencias: textoOuNulo(dados, "preferencias"),
  });
  if (error) return { erro: "Não foi possível salvar a ficha técnica." };

  revalidatePath(`/clientes/${cliente_id}`);
  redirect(`/clientes/${cliente_id}?salvo=ficha`);
}

// ---------------------------------------------------------------- Anotações

export async function criarAnotacao(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const { profissional } = await exigirEquipe();
  const cliente_id = texto(dados, "cliente_id");
  const conteudo = texto(dados, "texto");
  if (!conteudo) return { erro: "Escreva a anotação antes de salvar." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anotacoes_clientes").insert({ cliente_id, texto: conteudo, autor_id: profissional.id });
  if (error) return { erro: "Não foi possível salvar a anotação." };

  revalidatePath(`/clientes/${cliente_id}`);
  redirect(`/clientes/${cliente_id}#anotacoes`);
}

export async function editarAnotacao(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const cliente_id = texto(dados, "cliente_id");
  const conteudo = texto(dados, "texto");
  if (!conteudo) return { erro: "A anotação não pode ficar vazia." };

  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("anotacoes_clientes").update({ texto: conteudo }, { count: "exact" }).eq("id", id);
  if (error || !count) return { erro: "Só quem escreveu pode corrigir esta anotação." };

  revalidatePath(`/clientes/${cliente_id}`);
  redirect(`/clientes/${cliente_id}#anotacoes`);
}

export async function apagarAnotacao(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const cliente_id = texto(dados, "cliente_id");

  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("anotacoes_clientes").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { erro: "Você não tem permissão para apagar esta anotação." };

  revalidatePath(`/clientes/${cliente_id}`);
  redirect(`/clientes/${cliente_id}#anotacoes`);
}

// ---------------------------------------------------------------- Saldo (só dono)

export async function lancarSaldo(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const cliente_id = texto(dados, "cliente_id");
  const tipo = texto(dados, "tipo");
  const valor = reaisParaCentavos(texto(dados, "valor"));
  const descricao = texto(dados, "descricao");

  if (tipo !== "credito" && tipo !== "debito") return { erro: "Escolha crédito ou débito." };
  if (!valor) return { erro: "Informe um valor maior que zero, ex.: 50,00." };
  if (!descricao) return { erro: "Informe o motivo do lançamento." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("movimentos_saldo").insert({
    cliente_id,
    valor_centavos: tipo === "credito" ? valor : -valor,
    descricao,
  });
  if (error) return { erro: "Não foi possível lançar no saldo." };

  revalidatePath(`/clientes/${cliente_id}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${cliente_id}#saldo`);
}

export async function apagarMovimento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const cliente_id = texto(dados, "cliente_id");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("movimentos_saldo").delete().eq("id", id);
  if (error) return { erro: "Não foi possível apagar o lançamento." };

  revalidatePath(`/clientes/${cliente_id}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${cliente_id}#saldo`);
}
