"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { EstadoForm } from "@/components/formulario";

function mensagemErro(msg: string) {
  if (msg.includes("profissionais_email_unico")) return "Já existe alguém da equipe com esse e-mail.";
  if (msg.includes("pelo menos um dono")) return "O sistema precisa ter pelo menos um dono ativo com login.";
  return "Não foi possível salvar. Tente de novo.";
}

export async function salvarProfissional(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirDono();
  const id = String(dados.get("id") ?? "");
  const nome = String(dados.get("nome") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const registro = {
    nome,
    email: email || null,
    funcao: String(dados.get("funcao") ?? "").trim() || null,
    papel: dados.get("papel") === "dono" ? "dono" : "profissional",
    recebe_comissao: dados.get("recebe_comissao") === "on",
    cor: String(dados.get("cor") ?? "#96604A"),
    ativo: dados.get("ativo") === "on",
  };
  if (!nome) return { erro: "Informe o nome." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." };

  const supabase = await criarClienteServidor();
  const { error } = id
    ? await supabase.from("profissionais").update(registro).eq("id", id)
    : await supabase.from("profissionais").insert(registro);
  if (error) return { erro: mensagemErro(error.message) };

  revalidatePath("/", "layout");
  redirect("/equipe");
}
