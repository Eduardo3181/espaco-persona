"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { dataValida } from "@/lib/agenda";
import { periodoDaChave } from "@/lib/periodo";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();

export async function registrarPagamento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const periodo = periodoDaChave(texto(dados, "periodo"));
  const data = texto(dados, "data_pagamento");
  const forma = texto(dados, "forma");
  if (!periodo) return { erro: "Período inválido." };
  if (!dataValida(data)) return { erro: "Data do pagamento inválida." };
  if (!["pix", "dinheiro", "transferencia"].includes(forma)) return { erro: "Escolha a forma de pagamento." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_pagamento", {
    p_profissional_id: texto(dados, "profissional_id"),
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_data: data,
    p_forma: forma,
    p_observacao: texto(dados, "observacao"),
  });
  if (error) return { erro: error.code === "P0001" ? error.message : "Não foi possível registrar o pagamento." };

  revalidatePath("/comissoes");
  redirect(`/comissoes?p=${periodo.chave}&pago=1`);
}

export async function desfazerPagamento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("desfazer_pagamento", { p_pagamento_id: texto(dados, "pagamento_id") });
  if (error) return { erro: error.code === "P0001" ? error.message : "Não foi possível desfazer o pagamento." };
  revalidatePath("/comissoes");
  redirect("/comissoes?aba=pagas");
}
