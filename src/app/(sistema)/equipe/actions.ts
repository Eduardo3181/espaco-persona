"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BUCKET_FOTOS } from "@/lib/fotos";
import type { EstadoForm } from "@/components/formulario";

function mensagemErro(msg: string) {
  if (msg.includes("profissionais_email_unico")) return "Já existe alguém da equipe com esse e-mail.";
  if (msg.includes("pelo menos um dono")) return "O sistema precisa ter pelo menos um dono ativo com login.";
  return "Não foi possível salvar. Tente de novo.";
}

/** Foto já recortada no navegador: JPEG em base64, de até 1 MB. */
function lerFoto(texto: string): Buffer | "invalida" | null {
  if (!texto) return null;
  const achado = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(texto);
  if (!achado) return "invalida";
  const foto = Buffer.from(achado[1], "base64");
  return foto.length > 1024 * 1024 || foto[0] !== 0xff || foto[1] !== 0xd8 ? "invalida" : foto;
}

/** Grava ou remove a foto; a antiga só sai depois que a nova estiver gravada. Devolve o erro, se houver. */
async function gravarFoto(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, id: string, foto: Buffer | null): Promise<string | null> {
  const { data: atual } = await supabase.from("profissionais").select("foto_path").eq("id", id).maybeSingle();
  let novoCaminho: string | null = null;
  if (foto) {
    novoCaminho = `${id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(novoCaminho, foto, { contentType: "image/jpeg" });
    if (error) return "a foto não foi enviada. Tente de novo.";
  }
  const { error } = await supabase.from("profissionais").update({ foto_path: novoCaminho }).eq("id", id);
  if (error) return "a foto não foi atualizada. Tente de novo.";
  if (atual?.foto_path) await supabase.storage.from(BUCKET_FOTOS).remove([atual.foto_path]);
  return null;
}

/** Foto de quem já está cadastrada: grava na hora, sem precisar salvar o formulário. */
export async function salvarFoto(id: string, foto: string | null): Promise<{ erro?: string }> {
  await exigirDono();
  const lida = foto === null ? null : lerFoto(foto);
  if (lida === "invalida") return { erro: "Foto inválida. Escolha outra imagem." };
  const supabase = await criarClienteServidor();
  const erro = await gravarFoto(supabase, id, lida);
  if (erro) return { erro: erro.charAt(0).toUpperCase() + erro.slice(1) };
  revalidatePath("/", "layout");
  return {};
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
    ordem: Math.min(Math.max(Math.round(Number(dados.get("ordem")) || 99), 1), 99),
    ativo: dados.get("ativo") === "on",
  };
  if (!nome) return { erro: "Informe o nome." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." };

  const fotoNova = lerFoto(String(dados.get("foto_nova") ?? ""));
  if (fotoNova === "invalida") return { erro: "Foto inválida. Escolha outra imagem." };

  const supabase = await criarClienteServidor();
  const { data: salvo, error } = id
    ? await supabase.from("profissionais").update(registro).eq("id", id).select("id").single()
    : await supabase.from("profissionais").insert(registro).select("id").single();
  if (error || !salvo) return { erro: mensagemErro(error?.message ?? "") };

  // Cadastro novo: a foto escolhida é gravada junto (quem já existe grava na hora, em salvarFoto)
  if (fotoNova) {
    const erroFoto = await gravarFoto(supabase, salvo.id, fotoNova);
    if (erroFoto) return { erro: `Os dados foram salvos, mas ${erroFoto}` };
  }

  revalidatePath("/", "layout");
  redirect("/equipe");
}
