"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { reaisParaCentavos } from "@/lib/formato";
import { TIPOS_USO, type TipoProdutoUso } from "@/lib/produtos-uso";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
/** "60", "2,5", "1.000" → número; vazio → null; inválido → NaN */
function numero(v: string) {
  if (!v) return null;
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", "."));
  return Number(/^\d{1,3}(\.\d{3})+$/.test(v) ? v.replace(/\./g, "") : v);
}

export async function salvarProdutoUso(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = texto(dados, "id");
  const tipo = texto(dados, "tipo") as TipoProdutoUso;
  const numeroTom = texto(dados, "numero") || null;
  const nome = texto(dados, "nome");
  const embalagem = numero(texto(dados, "embalagem"));
  const valor = texto(dados, "valor") ? reaisParaCentavos(texto(dados, "valor")) : 0;
  const estoqueEmb = numero(texto(dados, "estoque"));
  const minimo = numero(texto(dados, "minimo"));

  if (!TIPOS_USO.some((t) => t.id === tipo)) return { erro: "Escolha o tipo." };
  if (tipo === "coloracao" && !numeroTom) return { erro: "Informe o número da coloração (ex.: 7.1)." };
  if (!nome && tipo !== "coloracao") return { erro: "Informe o nome do produto." };
  if (embalagem !== null && (Number.isNaN(embalagem) || embalagem <= 0)) return { erro: "Tamanho da embalagem inválido (ex.: 60)." };
  if (valor === null) return { erro: "Valor de compra inválido. Use o formato 32,90." };
  if (estoqueEmb !== null && Number.isNaN(estoqueEmb)) return { erro: "Estoque atual inválido (em embalagens, ex.: 2 ou 1,5)." };
  if (estoqueEmb && !embalagem) return { erro: "Para informar o estoque, preencha o tamanho da embalagem." };
  if (minimo !== null && (Number.isNaN(minimo) || minimo < 0)) return { erro: "Estoque mínimo inválido (em embalagens)." };

  const registro = {
    tipo, familia: texto(dados, "familia") || null, numero: numeroTom,
    nome: nome || `Coloração ${numeroTom}`,
    embalagem_qtd: embalagem, unidade: texto(dados, "unidade") === "ml" ? "ml" : "g",
    valor_compra_centavos: valor,
    estoque_qtd: Math.round((estoqueEmb ?? 0) * (embalagem ?? 0) * 100) / 100,
    estoque_minimo_embalagens: minimo ?? 0,
    observacao: texto(dados, "observacao") || null,
    ativo: dados.get("ativo") === "on",
  };
  const supabase = await criarClienteServidor();
  const { error } = id
    ? await supabase.from("produtos_uso").update(registro).eq("id", id)
    : await supabase.from("produtos_uso").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe uma coloração com esse número." : "Não foi possível salvar." };
  revalidatePath("/produtos-uso");
  redirect("/produtos-uso");
}
