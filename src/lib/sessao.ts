import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Papel = "dono" | "profissional";

export type UsuarioAtual = {
  usuarioId: string;
  email: string | null;
  /** null quando o login existe mas ainda não está ligado a ninguém da equipe */
  profissional: { id: string; nome: string; papel: Papel; funcao: string | null } | null;
};

/** Lê o usuário logado uma vez por requisição. */
export const obterUsuario = cache(async (): Promise<UsuarioAtual | null> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: prof } = await supabase
    .from("profissionais")
    .select("id, nome, papel, funcao")
    .eq("usuario_id", claims.sub)
    .eq("ativo", true)
    .maybeSingle();

  return {
    usuarioId: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    profissional: prof ?? null,
  };
});

/** Exige alguém da equipe logado. Use no topo de páginas e ações. */
export async function exigirEquipe() {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");
  if (!usuario.profissional) redirect("/sem-acesso");
  return { ...usuario, profissional: usuario.profissional };
}

/** Exige o dono. Profissionais são mandadas para o início. */
export async function exigirDono() {
  const usuario = await exigirEquipe();
  if (usuario.profissional.papel !== "dono") redirect("/");
  return usuario;
}
