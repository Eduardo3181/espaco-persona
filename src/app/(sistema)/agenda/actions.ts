"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { normalizarTelefone } from "@/lib/formato";
import { dataValida, paraTimestamp, partesSP, somarDias, type StatusAgendamento } from "@/lib/agenda";
import type { EstadoForm } from "@/components/formulario";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const horaValida = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Descreve o que já ocupa o horário, para a mensagem de erro. */
async function descreverConflito(supabase: Supabase, profissionalId: string, inicio: string, fim: string, ignorarId?: string) {
  let q = supabase
    .from("agendamentos")
    .select("id, tipo, inicio, fim, motivo, clientes(nome)")
    .eq("profissional_id", profissionalId)
    .not("status", "in", "(cancelado,faltou)")
    .lt("inicio", fim)
    .gt("fim", inicio)
    .limit(1);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data } = await q;
  const c = data?.[0] as unknown as { tipo: string; inicio: string; fim: string; motivo: string | null; clientes: { nome: string } | null } | undefined;
  if (!c) return "Horário ocupado para esta profissional.";
  const quem = c.tipo === "bloqueio" ? `bloqueio (${c.motivo || "sem motivo"})` : c.clientes?.nome ?? "outro agendamento";
  return `Horário ocupado: ${quem} das ${partesSP(c.inicio).hora} às ${partesSP(c.fim).hora}.`;
}

// ---------------------------------------------------------------- Busca de clientes (autocompletar)

export async function buscarClientes(termo: string) {
  await exigirEquipe();
  const t = termo.trim();
  if (t.length < 2) return [];
  const supabase = await criarClienteServidor();
  const digitos = t.replace(/\D/g, "");
  const soNumeros = digitos.length >= 3 && digitos.length === t.replace(/[\s()+-]/g, "").length;
  const busca = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[%_]/g, " ");
  const q = supabase.from("clientes").select("id, nome, telefone").eq("ativo", true).order("nome").limit(8);
  const { data } = soNumeros ? await q.like("telefone", `%${digitos}%`) : await q.like("nome_busca", `%${busca}%`);
  return data ?? [];
}

// ---------------------------------------------------------------- Atendimento

export async function salvarAgendamento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const { profissional: eu } = await exigirEquipe();
  const id = texto(dados, "id") || null;
  const profissionalId = eu.papel === "dono" ? texto(dados, "profissional_id") : eu.id;
  let clienteId = texto(dados, "cliente_id");
  const novoNome = texto(dados, "novo_cliente_nome");
  const novoTelefone = normalizarTelefone(texto(dados, "novo_cliente_telefone"));
  const data = texto(dados, "data");
  const hora = texto(dados, "hora");
  const duracao = Number(texto(dados, "duracao"));
  const servicos = dados.getAll("servico").map(String).filter(Boolean);
  const observacao = texto(dados, "observacao");

  if (!profissionalId) return { erro: "Escolha a profissional." };
  if (!clienteId && !novoNome) return { erro: "Escolha a cliente (ou cadastre uma nova)." };
  if (!dataValida(data)) return { erro: "Data inválida." };
  if (!horaValida(hora)) return { erro: "Hora inválida." };
  if (!servicos.length) return { erro: "Escolha pelo menos um serviço." };
  if (!Number.isInteger(duracao) || duracao <= 0 || duracao > 720) return { erro: "Duração inválida (em minutos)." };
  if (novoTelefone && (novoTelefone.length < 10 || novoTelefone.length > 11)) return { erro: "Telefone da nova cliente inválido." };

  const supabase = await criarClienteServidor();
  const inicio = paraTimestamp(data, hora);
  const fim = new Date(new Date(inicio).getTime() + duracao * 60000).toISOString();

  // Confere o horário antes de criar uma cliente nova
  const { count } = await supabase
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("profissional_id", profissionalId)
    .not("status", "in", "(cancelado,faltou)")
    .lt("inicio", fim)
    .gt("fim", inicio)
    .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  if (count) return { erro: await descreverConflito(supabase, profissionalId, inicio, fim, id ?? undefined) };

  if (!clienteId) {
    const { data: nova, error } = await supabase
      .from("clientes")
      .insert({ nome: novoNome, telefone: novoTelefone || null })
      .select("id")
      .single();
    if (error || !nova) return { erro: "Não foi possível cadastrar a nova cliente." };
    clienteId = nova.id;
  }

  const { error } = await supabase.rpc("salvar_agendamento", {
    p_id: id,
    p_profissional_id: profissionalId,
    p_cliente_id: clienteId,
    p_inicio: inicio,
    p_duracao_min: duracao,
    p_servicos: servicos,
    p_observacao: observacao,
  });
  if (error) {
    if (error.code === "23P01") return { erro: await descreverConflito(supabase, profissionalId, inicio, fim, id ?? undefined) };
    if (error.code === "P0001") return { erro: error.message };
    return { erro: "Não foi possível salvar o agendamento." };
  }

  revalidatePath("/agenda");
  redirect(`/agenda?data=${data}&prof=${profissionalId}`);
}

const STATUS_PERMITIDOS: StatusAgendamento[] = ["aguardando", "confirmado", "cancelado", "faltou"];

export async function mudarStatus(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const status = texto(dados, "status") as StatusAgendamento;
  if (!STATUS_PERMITIDOS.includes(status)) return { erro: "Status inválido." };

  const supabase = await criarClienteServidor();
  const { data: atual } = await supabase.from("agendamentos").select("profissional_id, inicio, fim").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Agendamento não encontrado." };

  const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id);
  if (error) {
    if (error.code === "23P01") {
      return { erro: `Não dá para reativar: ${(await descreverConflito(supabase, atual.profissional_id, atual.inicio, atual.fim, id)).replace("Horário ocupado: ", "o horário já está ocupado por ")}` };
    }
    return { erro: "Não foi possível mudar o status." };
  }
  revalidatePath("/agenda");
  redirect(`/agenda/${id}`);
}

// ---------------------------------------------------------------- Bloqueios

export async function salvarBloqueio(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const { profissional: eu } = await exigirEquipe();
  const profissionalId = eu.papel === "dono" ? texto(dados, "profissional_id") : eu.id;
  const data = texto(dados, "data");
  const horaIni = texto(dados, "hora_inicio");
  const horaFim = texto(dados, "hora_fim");
  const motivo = texto(dados, "motivo");
  const repetir = texto(dados, "repetir"); // "", "diario", "semanal"
  const ate = texto(dados, "ate");

  if (!profissionalId) return { erro: "Escolha a profissional." };
  if (!dataValida(data)) return { erro: "Data inválida." };
  if (!horaValida(horaIni) || !horaValida(horaFim)) return { erro: "Horário inválido." };
  if (horaFim <= horaIni) return { erro: "O fim precisa ser depois do início." };
  if (!motivo) return { erro: "Informe o motivo (ex.: almoço, folga, médico)." };

  const datas = [data];
  if (repetir) {
    if (!dataValida(ate) || ate <= data) return { erro: "Para repetir, informe até quando (data depois do primeiro dia)." };
    const passo = repetir === "semanal" ? 7 : 1;
    for (let d = somarDias(data, passo); d <= ate; d = somarDias(d, passo)) datas.push(d);
    if (datas.length > 400) return { erro: "Repetição longa demais (máximo de 400 dias)." };
  }

  const supabase = await criarClienteServidor();
  const linhas = datas.map((d) => ({ inicio: paraTimestamp(d, horaIni), fim: paraTimestamp(d, horaFim) }));

  // Confere conflitos em todo o período antes de gravar
  const { data: existentes } = await supabase
    .from("agendamentos")
    .select("inicio, fim")
    .eq("profissional_id", profissionalId)
    .not("status", "in", "(cancelado,faltou)")
    .lt("inicio", linhas[linhas.length - 1].fim)
    .gt("fim", linhas[0].inicio);
  const conflitos = linhas.filter((l) =>
    (existentes ?? []).some((e) => new Date(e.inicio) < new Date(l.fim) && new Date(e.fim) > new Date(l.inicio)),
  );
  if (conflitos.length) {
    const dias = conflitos.slice(0, 5).map((c) => partesSP(c.inicio).data.split("-").reverse().slice(0, 2).join("/"));
    return { erro: `Já há agendamentos nesse horário em: ${dias.join(", ")}${conflitos.length > 5 ? ` e mais ${conflitos.length - 5} dia(s)` : ""}. Ajuste o horário ou remarque antes.` };
  }

  const grupo = datas.length > 1 ? crypto.randomUUID() : null;
  const { error } = await supabase.from("agendamentos").insert(
    linhas.map((l) => ({
      tipo: "bloqueio", profissional_id: profissionalId, inicio: l.inicio, fim: l.fim,
      status: "confirmado", motivo, grupo_repeticao: grupo,
    })),
  );
  if (error) return { erro: error.code === "23P01" ? "Algum dos horários ficou ocupado. Tente de novo." : "Não foi possível bloquear o horário." };

  revalidatePath("/agenda");
  redirect(`/agenda?data=${data}&prof=${profissionalId}`);
}

export async function excluirBloqueio(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const todosFuturos = texto(dados, "escopo") === "futuros";
  const supabase = await criarClienteServidor();
  const { data: b } = await supabase.from("agendamentos").select("inicio, profissional_id, grupo_repeticao").eq("id", id).eq("tipo", "bloqueio").maybeSingle();
  if (!b) return { erro: "Bloqueio não encontrado." };

  const q = todosFuturos && b.grupo_repeticao
    ? supabase.from("agendamentos").delete().eq("grupo_repeticao", b.grupo_repeticao).gte("inicio", b.inicio)
    : supabase.from("agendamentos").delete().eq("id", id);
  const { error } = await q;
  if (error) return { erro: "Não foi possível excluir o bloqueio." };

  revalidatePath("/agenda");
  redirect(`/agenda?data=${partesSP(b.inicio).data}&prof=${b.profissional_id}`);
}

export async function excluirAgendamento(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const supabase = await criarClienteServidor();
  const { data: a } = await supabase.from("agendamentos").select("inicio, profissional_id, status").eq("id", id).maybeSingle();
  if (!a) return { erro: "Agendamento não encontrado." };
  if (a.status === "em_atendimento" || a.status === "concluido") return { erro: "Agendamento com comanda não pode ser excluído." };
  const { error } = await supabase.from("agendamentos").delete().eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/agenda");
  redirect(`/agenda?data=${partesSP(a.inicio).data}&prof=${a.profissional_id}`);
}