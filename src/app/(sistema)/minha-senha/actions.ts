"use server";

import { redirect } from "next/navigation";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { EstadoForm } from "@/components/formulario";

export async function trocarSenha(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const senha = String(dados.get("senha") ?? "");
  const confirmacao = String(dados.get("confirmacao") ?? "");
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== confirmacao) return { erro: "As duas senhas não são iguais." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    if (error.code === "same_password") return { erro: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { erro: "Senha fraca. Use letras e números, com pelo menos 8 caracteres." };
    return { erro: "Não foi possível alterar a senha. Tente de novo." };
  }
  redirect("/minha-senha?salvo=1");
}
