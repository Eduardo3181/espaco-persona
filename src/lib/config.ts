import "server-only";
import { cache } from "react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { diasValidos, type DiasPagamento } from "@/lib/periodo";

export type ConfigEquipe = {
  dias: DiasPagamento;
  msgConfirmacao: string;
  msgAniversario: string;
};

/** Configurações que toda a equipe usa (dias de pagamento e mensagens). */
export const obterConfigEquipe = cache(async (): Promise<ConfigEquipe> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("config_equipe");
  const c = (data ?? {}) as { dias_pagamento?: number[]; msg_confirmacao?: string; msg_aniversario?: string };
  return {
    dias: diasValidos(c.dias_pagamento),
    msgConfirmacao: c.msg_confirmacao ?? "",
    msgAniversario: c.msg_aniversario ?? "",
  };
});

/** Troca {cliente}, {data}, {hora}, {profissional} pelo valor */
export function preencherMensagem(modelo: string, valores: Partial<Record<"cliente" | "data" | "hora" | "profissional", string>>) {
  return modelo.replace(/\{(cliente|data|hora|profissional)\}/g, (_, chave: keyof typeof valores) => valores[chave] ?? "");
}
