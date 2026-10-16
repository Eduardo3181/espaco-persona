"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono, exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { reaisParaCentavos } from "@/lib/formato";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();

function erroDoBanco(error: { code?: string; message: string } | null, padrao: string) {
  if (!error) return padrao;
  return error.code === "P0001" ? error.message : padrao;
}

function atualizar(id?: string) {
  revalidatePath("/comandas");
  revalidatePath("/agenda");
  if (id) revalidatePath(`/comandas/${id}`);
}

// ---------------------------------------------------------------- Abrir

export async function abrirComanda(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const agendamentoId = texto(dados, "agendamento_id") || null;
  const clienteId = texto(dados, "cliente_id") || null;
  const supabase = await criarClienteServidor();
  const { data: id, error } = await supabase.rpc("abrir_comanda", { p_cliente_id: clienteId, p_agendamento_id: agendamentoId });
  if (error || !id) return { erro: erroDoBanco(error, "Não foi possível abrir a comanda.") };
  atualizar();
  redirect(`/comandas/${id}`);
}

// ---------------------------------------------------------------- Itens (equipe)

export async function lancarItem(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const { profissional: eu } = await exigirEquipe();
  const comandaId = texto(dados, "comanda_id");
  const [tipo, refId] = texto(dados, "item").split(":");
  const quantidade = Number(texto(dados, "quantidade") || "1");
  const profissionalId = eu.papel === "dono" ? texto(dados, "profissional_id") : eu.id;
  if (!tipo || !refId) return { erro: "Escolha o serviço ou produto." };
  if (!Number.isInteger(quantidade) || quantidade <= 0) return { erro: "Quantidade inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("lancar_item", {
    p_comanda_id: comandaId, p_tipo: tipo, p_ref_id: refId, p_quantidade: quantidade, p_profissional_id: profissionalId,
  });
  if (error) return { erro: erroDoBanco(error, "Não foi possível lançar o item.") };
  atualizar(comandaId);
  redirect(`/comandas/${comandaId}`);
}

export async function removerItem(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const comandaId = texto(dados, "comanda_id");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("remover_item", { p_item_id: texto(dados, "item_id") });
  if (error) return { erro: erroDoBanco(error, "Não foi possível remover o item.") };
  atualizar(comandaId);
  redirect(`/comandas/${comandaId}`);
}

export async function anotarVisita(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const { profissional: eu } = await exigirEquipe();
  const comandaId = texto(dados, "comanda_id");
  const clienteId = texto(dados, "cliente_id");
  const conteudo = texto(dados, "texto");
  if (!conteudo) return { erro: "Escreva a anotação." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anotacoes_clientes").insert({
    cliente_id: clienteId, comanda_id: comandaId, texto: conteudo, autor_id: eu.id,
  });
  if (error) return { erro: "Não foi possível salvar a anotação." };
  revalidatePath(`/clientes/${clienteId}`);
  atualizar(comandaId);
  redirect(`/comandas/${comandaId}`);
}

// ---------------------------------------------------------------- Só o dono

export async function alterarValorItem(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const comandaId = texto(dados, "comanda_id");
  const valor = reaisParaCentavos(texto(dados, "valor"));
  if (valor === null) return { erro: "Valor inválido. Use o formato 120,00." };
  const supabase = await criarClienteServidor();
  const { data: c } = await supabase.from("comandas").select("status").eq("id", comandaId).single();
  if (c?.status !== "aberta") return { erro: "A comanda não está aberta." };
  const { error } = await supabase.from("comanda_itens").update({ valor_unitario_centavos: valor })
    .eq("id", texto(dados, "item_id")).eq("comanda_id", comandaId);
  if (error) return { erro: "Não foi possível alterar o valor." };
  atualizar(comandaId);
  redirect(`/comandas/${comandaId}`);
}

export async function trocarCliente(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const comandaId = texto(dados, "comanda_id");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("comandas").update({ cliente_id: texto(dados, "cliente_id") || null })
    .eq("id", comandaId).eq("status", "aberta");
  if (error) return { erro: "Não foi possível trocar a cliente." };
  atualizar(comandaId);
  redirect(`/comandas/${comandaId}`);
}

type Caixinha = { profissional_id: string; valor_centavos: number };
type Pagamento = { forma: string; valor_centavos: number };

function lerFechamento(dados: FormData) {
  const caixinhas = JSON.parse(texto(dados, "caixinhas") || "[]") as Caixinha[];
  const pagamentos = JSON.parse(texto(dados, "pagamentos") || "[]") as Pagamento[];
  return { caixinhas, pagamentos };
}

export async function manterAberta(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const comandaId = texto(dados, "comanda_id");
  const { caixinhas, pagamentos } = lerFechamento(dados);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_caixinhas_pagamentos", { p_comanda_id: comandaId, p_caixinhas: caixinhas, p_pagamentos: pagamentos });
  if (error) return { erro: erroDoBanco(error, "Não foi possível salvar.") };
  atualizar(comandaId);
  redirect("/comandas");
}

export async function fecharComanda(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const comandaId = texto(dados, "comanda_id");
  const { caixinhas, pagamentos } = lerFechamento(dados);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fechar_comanda", { p_comanda_id: comandaId, p_caixinhas: caixinhas, p_pagamentos: pagamentos });
  if (error) return { erro: erroDoBanco(error, "Não foi possível fechar a comanda.") };
  atualizar(comandaId);
  revalidatePath("/clientes", "layout");
  redirect(`/comandas/${comandaId}?fechada=1`);
}

export async function cancelarComanda(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const comandaId = texto(dados, "comanda_id");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cancelar_comanda", { p_comanda_id: comandaId, p_motivo: texto(dados, "motivo") });
  if (error) return { erro: erroDoBanco(error, "Não foi possível cancelar a comanda.") };
  atualizar(comandaId);
  redirect("/comandas");
}

export async function reabrirComanda(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const comandaId = texto(dados, "comanda_id");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reabrir_comanda", { p_comanda_id: comandaId, p_motivo: texto(dados, "motivo") });
  if (error) return { erro: erroDoBanco(error, "Não foi possível reabrir a comanda.") };
  atualizar(comandaId);
  revalidatePath("/clientes", "layout");
  redirect(`/comandas/${comandaId}`);
}
