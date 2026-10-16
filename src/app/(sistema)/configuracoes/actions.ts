"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPercentual } from "@/lib/formato";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();

async function gravar(campos: Record<string, unknown>): Promise<EstadoForm | null> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("configuracoes").update(campos).eq("id", true);
  if (error) return { erro: "Não foi possível salvar as configurações." };
  revalidatePath("/", "layout");
  return null;
}

export async function salvarFinanceiro(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const debito = lerPercentual(texto(dados, "taxa_debito"));
  const credito = lerPercentual(texto(dados, "taxa_credito"));
  const pix = lerPercentual(texto(dados, "taxa_pix") || "0");
  const dia1 = Number(texto(dados, "dia1"));
  const dia2 = Number(texto(dados, "dia2"));
  for (const t of [debito, credito, pix]) {
    if (t === null || Number.isNaN(t)) return { erro: "Taxas devem ser números entre 0 e 100 (ex.: 3,49)." };
  }
  if (!Number.isInteger(dia1) || !Number.isInteger(dia2) || dia1 < 1 || dia2 > 28 || dia1 >= dia2) {
    return { erro: "Dias de pagamento: dois dias diferentes entre 1 e 28, o primeiro menor que o segundo." };
  }
  const erro = await gravar({
    taxa_debito: debito, taxa_credito: credito, taxa_pix: pix,
    caixinha_desconta_taxa: dados.get("caixinha_desconta_taxa") === "on",
    dias_pagamento: [dia1, dia2],
  });
  if (erro) return erro;
  redirect("/configuracoes?salvo=financeiro");
}

export async function salvarMensagens(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const confirmacao = texto(dados, "msg_confirmacao");
  const aniversario = texto(dados, "msg_aniversario");
  if (!confirmacao || !aniversario) return { erro: "As duas mensagens precisam ter texto." };
  const erro = await gravar({ msg_confirmacao: confirmacao, msg_aniversario: aniversario });
  if (erro) return erro;
  redirect("/configuracoes?salvo=mensagens");
}
