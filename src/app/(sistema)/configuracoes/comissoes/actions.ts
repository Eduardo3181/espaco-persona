"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPercentual } from "@/lib/formato";
import type { EstadoForm } from "@/components/formulario";
import type { RegraComissao } from "@/lib/comissao";

/**
 * Campos do formulário:
 *   padrao__<profissional>              → percentual padrão
 *   categoria__<profissional>__<categoria> → percentual da categoria
 * Vazio apaga a regra.
 */
export async function salvarRegras(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();

  type Desejada = { profissional_id: string; tipo: "padrao" | "categoria"; categoria_id: string | null; percentual: number | null };
  const desejadas: Desejada[] = [];
  for (const [campo, valor] of dados.entries()) {
    const partes = campo.split("__");
    if (partes[0] !== "padrao" && partes[0] !== "categoria") continue;
    const percentual = lerPercentual(String(valor));
    if (Number.isNaN(percentual)) return { erro: "Use números entre 0 e 100 nos percentuais." };
    desejadas.push({
      profissional_id: partes[1],
      tipo: partes[0],
      categoria_id: partes[0] === "categoria" ? partes[2] : null,
      percentual,
    });
  }

  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("regras_comissao").select("*").in("tipo", ["padrao", "categoria"]);
  const existentes = (data ?? []) as RegraComissao[];

  for (const d of desejadas) {
    const atual = existentes.find(
      (r) => r.profissional_id === d.profissional_id && r.tipo === d.tipo && r.categoria_id === d.categoria_id,
    );
    let resultado;
    if (d.percentual === null) {
      if (atual) resultado = await supabase.from("regras_comissao").delete().eq("id", atual.id);
    } else if (!atual) {
      resultado = await supabase.from("regras_comissao").insert({
        profissional_id: d.profissional_id, tipo: d.tipo, categoria_id: d.categoria_id, percentual: d.percentual,
      });
    } else if (Number(atual.percentual) !== d.percentual) {
      resultado = await supabase.from("regras_comissao").update({ percentual: d.percentual }).eq("id", atual.id);
    }
    if (resultado?.error) return { erro: "Não foi possível salvar todas as regras. Tente de novo." };
  }

  revalidatePath("/", "layout");
  redirect("/configuracoes/comissoes?salvo=1");
}
