"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { normalizarTelefone } from "@/lib/formato";
import { RECORRENCIAS, dataValida, datasDaRecorrencia, paraTimestamp, partesSP, somarDias, somarMeses, type Recorrencia, type StatusAgendamento } from "@/lib/agenda";
import { horariosAbertosDaSerie } from "./dados";
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

/** Períodos já ocupados na agenda da profissional, para conferir várias datas de uma vez. */
async function ocupadosNoPeriodo(supabase: Supabase, profissionalId: string, inicio: string, fim: string, ignorarIds: string[] = []) {
  const { data } = await supabase
    .from("agendamentos")
    .select("id, inicio, fim")
    .eq("profissional_id", profissionalId)
    .not("status", "in", "(cancelado,faltou)")
    .lt("inicio", fim)
    .gt("fim", inicio);
  return (data ?? []).filter((o) => !ignorarIds.includes(o.id));
}

const sobrepoe = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) =>
  new Date(a.inicio) < new Date(b.fim) && new Date(b.inicio) < new Date(a.fim);

const ERRO_HORARIO_OCUPADO = "Um dos horários acabou de ser ocupado. Confira a agenda e tente de novo.";

/** Volta para a agenda mostrando o resultado de uma ação na recorrência. */
function agendaComAviso(data: string, profissionalId: string, acao: "criados" | "alterados", qtd: number, puladas: string[]) {
  const u = new URLSearchParams({ data, prof: profissionalId, serie: acao, qtd: String(qtd) });
  if (puladas.length) u.set("puladas", puladas.join(","));
  return `/agenda?${u}`;
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
  let clienteId = texto(dados, "cliente_id");
  const novoNome = texto(dados, "novo_cliente_nome");
  const novoTelefone = normalizarTelefone(texto(dados, "novo_cliente_telefone"));
  const data = texto(dados, "data");
  const observacao = texto(dados, "observacao");
  const recorrencia = id ? "" : texto(dados, "recorrencia");
  const repetirAte = texto(dados, "repetir_ate");
  const escopo = texto(dados, "escopo");

  type BlocoForm = { profissional_id: string; hora: string; servicos: string[]; duracao: number };
  let blocosBrutos: BlocoForm[];
  try { blocosBrutos = JSON.parse(texto(dados, "blocos") || "[]"); } catch { return { erro: "Dados do agendamento inválidos." }; }
  // A profissional só agenda na própria coluna; editar mexe em um horário só
  const blocos = (id ? blocosBrutos.slice(0, 1) : blocosBrutos).map((b) => ({
    ...b, profissional_id: eu.papel === "dono" ? b.profissional_id : eu.id,
  }));

  if (!clienteId && !novoNome) return { erro: "Escolha a cliente (ou cadastre uma nova)." };
  if (!dataValida(data)) return { erro: "Data inválida." };
  if (!blocos.length) return { erro: "Inclua pelo menos uma profissional." };
  if (novoTelefone && (novoTelefone.length < 10 || novoTelefone.length > 11)) return { erro: "Telefone da nova cliente inválido." };

  const nomeProf = blocos.length > 1 ? (i: number) => ` (profissional ${i + 1})` : () => "";
  const periodos: { profissional_id: string; inicio: string; fim: string; duracao: number; servicos: string[] }[] = [];
  for (const [i, b] of blocos.entries()) {
    if (!b.profissional_id) return { erro: `Escolha a profissional${nomeProf(i)}.` };
    if (!horaValida(b.hora)) return { erro: `Hora inválida${nomeProf(i)}.` };
    if (!Array.isArray(b.servicos) || !b.servicos.length) return { erro: `Escolha pelo menos um serviço${nomeProf(i)}.` };
    if (!Number.isInteger(b.duracao) || b.duracao <= 0 || b.duracao > 720) return { erro: `Duração inválida${nomeProf(i)}.` };
    const inicio = paraTimestamp(data, b.hora);
    const fim = new Date(new Date(inicio).getTime() + b.duracao * 60000).toISOString();
    periodos.push({ profissional_id: b.profissional_id, inicio, fim, duracao: b.duracao, servicos: b.servicos });
  }
  // Mesma profissional duas vezes no mesmo horário
  for (let i = 0; i < periodos.length; i++) for (let j = i + 1; j < periodos.length; j++) {
    const a = periodos[i], b = periodos[j];
    if (a.profissional_id === b.profissional_id && new Date(a.inicio) < new Date(b.fim) && new Date(b.inicio) < new Date(a.fim)) {
      return { erro: "A mesma profissional aparece duas vezes em horários que se sobrepõem." };
    }
  }

  const supabase = await criarClienteServidor();

  // Datas da recorrência (novo agendamento)
  let datasSerie: string[] = [];
  if (recorrencia) {
    if (!RECORRENCIAS.includes(recorrencia as Recorrencia)) return { erro: "Recorrência inválida." };
    if (!dataValida(repetirAte) || repetirAte <= data) return { erro: "Informe até quando repetir (data depois do primeiro dia)." };
    if (repetirAte > somarMeses(data, 12)) return { erro: "A recorrência pode ir até 1 ano à frente." };
    datasSerie = datasDaRecorrencia(data, recorrencia as Recorrencia, repetirAte);
    if (datasSerie.length < 2) return { erro: "Até essa data não há outra repetição. Escolha uma data mais longe." };
  }

  // Alterar um horário de recorrência: é preciso dizer se vale só para ele ou para todos
  const { data: atual } = id
    ? await supabase.from("agendamentos").select("inicio, profissional_id, grupo_repeticao").eq("id", id).maybeSingle()
    : { data: null };
  if (id && !atual) return { erro: "Agendamento não encontrado." };
  if (atual?.grupo_repeticao && escopo !== "este" && escopo !== "todos") {
    return { erro: "Escolha se a alteração vale só para este agendamento ou para todos." };
  }
  const alterarTodos = Boolean(atual?.grupo_repeticao && escopo === "todos");

  // Confere os horários antes de criar uma cliente nova (recorrências conferem data por data, mais abaixo)
  for (const p of recorrencia || alterarTodos ? [] : periodos) {
    const { count } = await supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("profissional_id", p.profissional_id)
      .not("status", "in", "(cancelado,faltou)")
      .lt("inicio", p.fim)
      .gt("fim", p.inicio)
      .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
    if (count) return { erro: await descreverConflito(supabase, p.profissional_id, p.inicio, p.fim, id ?? undefined) };
  }

  // Novo agendamento recorrente: datas com horário ocupado ficam de fora e são avisadas
  type Bloco = { profissional_id: string; inicio: string; duracao_min: number; servicos: string[] };
  const datasLivres: { data: string; blocos: Bloco[] }[] = [];
  const puladas: string[] = [];
  if (recorrencia) {
    const ultimoDia = paraTimestamp(somarDias(datasSerie[datasSerie.length - 1], 2), "00:00");
    const ocupados = new Map<string, { inicio: string; fim: string }[]>();
    for (const profId of new Set(blocos.map((b) => b.profissional_id))) {
      ocupados.set(profId, await ocupadosNoPeriodo(supabase, profId, paraTimestamp(data, "00:00"), ultimoDia));
    }
    for (const d of datasSerie) {
      const blocosDia = blocos.map((b) => ({
        profissional_id: b.profissional_id, inicio: paraTimestamp(d, b.hora), duracao_min: b.duracao, servicos: b.servicos,
      }));
      const ocupada = blocosDia.some((b) => {
        const fim = new Date(new Date(b.inicio).getTime() + b.duracao_min * 60000).toISOString();
        return ocupados.get(b.profissional_id)!.some((o) => sobrepoe(o, { inicio: b.inicio, fim }));
      });
      if (ocupada) puladas.push(d);
      else datasLivres.push({ data: d, blocos: blocosDia });
    }
    if (!datasLivres.length) return { erro: "O horário está ocupado em todas as datas da recorrência." };
  }

  if (!clienteId) {
    const { data: nova, error } = await supabase
      .from("clientes")
      .insert({ nome: novoNome, telefone: novoTelefone || null })
      .select("id")
      .single();
    if (error || !nova) return { erro: "Não foi possível cadastrar a nova cliente." };
    clienteId = nova.id;
  }

  if (recorrencia) {
    const { error } = await supabase.rpc("criar_atendimentos_recorrentes", {
      p_cliente_id: clienteId, p_observacao: observacao, p_datas: datasLivres.map((d) => d.blocos),
    });
    if (error) {
      if (error.code === "23P01") return { erro: ERRO_HORARIO_OCUPADO };
      if (error.code === "P0001") return { erro: error.message };
      return { erro: "Não foi possível salvar a recorrência." };
    }
    revalidatePath("/agenda");
    redirect(agendaComAviso(datasLivres[0].data, periodos[0].profissional_id, "criados", datasLivres.length, puladas));
  }

  // Alterar todos: os horários andam juntos, na mesma diferença de dias
  if (alterarTodos && id && atual?.grupo_repeticao) {
    const novo = periodos[0];
    const diasDeDiferenca = Math.round(
      (new Date(`${data}T12:00:00Z`).getTime() - new Date(`${partesSP(atual.inicio).data}T12:00:00Z`).getTime()) / 86400000,
    );
    const horarios = await horariosAbertosDaSerie(supabase, atual.grupo_repeticao, id, atual.profissional_id);
    const hora = blocos[0].hora;
    const planejados = horarios.map((h) => {
      const inicio = paraTimestamp(somarDias(partesSP(h.inicio).data, diasDeDiferenca), hora);
      return { id: h.id, atual: h, inicio, fim: new Date(new Date(inicio).getTime() + novo.duracao * 60000).toISOString() };
    });

    // Quem não pode mudar fica onde está; isso pode ocupar o lugar de outro, então confere até estabilizar
    const instantes = [...planejados, ...horarios].flatMap((p) => [new Date(p.inicio).getTime(), new Date(p.fim).getTime()]);
    const externos = await ocupadosNoPeriodo(
      supabase, novo.profissional_id, new Date(Math.min(...instantes)).toISOString(), new Date(Math.max(...instantes)).toISOString(), horarios.map((h) => h.id),
    );
    const movendo = new Set(planejados.map((p) => p.id));
    for (let mudou = true; mudou;) {
      mudou = false;
      const parados = planejados.filter((p) => !movendo.has(p.id)).map((p) => p.atual);
      // Horários parados só atrapalham se continuam na agenda da mesma profissional
      const barreiras = novo.profissional_id === atual.profissional_id ? [...externos, ...parados] : externos;
      for (const p of planejados) {
        if (movendo.has(p.id) && barreiras.some((b) => sobrepoe(b, p))) { movendo.delete(p.id); mudou = true; }
      }
    }
    if (!movendo.has(id)) return { erro: await descreverConflito(supabase, novo.profissional_id, planejados.find((p) => p.id === id)!.inicio, planejados.find((p) => p.id === id)!.fim, id) };

    const paraMover = planejados.filter((p) => movendo.has(p.id));
    // Andando para a frente, grava primeiro os últimos (assim um não esbarra no outro)
    paraMover.sort((a, b) => (diasDeDiferenca > 0 ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio)));
    const { error } = await supabase.rpc("alterar_agendamentos_serie", {
      p_profissional_id: novo.profissional_id, p_cliente_id: clienteId, p_duracao_min: novo.duracao,
      p_servicos: novo.servicos, p_observacao: observacao,
      p_itens: paraMover.map((p) => ({ id: p.id, inicio: p.inicio })),
    });
    if (error) {
      if (error.code === "23P01") return { erro: ERRO_HORARIO_OCUPADO };
      if (error.code === "P0001") return { erro: error.message };
      return { erro: "Não foi possível alterar os agendamentos." };
    }
    revalidatePath("/agenda");
    const ficaram = planejados.filter((p) => !movendo.has(p.id)).map((p) => partesSP(p.atual.inicio).data);
    redirect(agendaComAviso(data, novo.profissional_id, "alterados", paraMover.length, ficaram));
  }

  const { error } = id
    ? await supabase.rpc("salvar_agendamento", {
        p_id: id, p_profissional_id: periodos[0].profissional_id, p_cliente_id: clienteId,
        p_inicio: periodos[0].inicio, p_duracao_min: periodos[0].duracao, p_servicos: periodos[0].servicos, p_observacao: observacao,
      })
    : await supabase.rpc("criar_atendimento", {
        p_cliente_id: clienteId,
        p_observacao: observacao,
        p_blocos: periodos.map((p) => ({ profissional_id: p.profissional_id, inicio: p.inicio, duracao_min: p.duracao, servicos: p.servicos })),
      });
  if (error) {
    if (error.code === "23P01") return { erro: ERRO_HORARIO_OCUPADO };
    if (error.code === "P0001") return { erro: error.message };
    return { erro: "Não foi possível salvar o agendamento." };
  }

  revalidatePath("/agenda");
  redirect(`/agenda?data=${data}&prof=${periodos[0].profissional_id}`);
}

const STATUS_PERMITIDOS: StatusAgendamento[] = ["aguardando", "confirmado", "cancelado", "faltou"];

export async function mudarStatus(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  await exigirEquipe();
  const id = texto(dados, "id");
  const status = texto(dados, "status") as StatusAgendamento;
  if (!STATUS_PERMITIDOS.includes(status)) return { erro: "Status inválido." };

  const supabase = await criarClienteServidor();
  const { data: atual } = await supabase.from("agendamentos").select("profissional_id, inicio, fim, grupo_repeticao").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Agendamento não encontrado." };

  // "Todos" vale para a cliente que cancelou a recorrência inteira
  const ids = texto(dados, "escopo") === "todos" && status === "cancelado" && atual.grupo_repeticao
    ? (await horariosAbertosDaSerie(supabase, atual.grupo_repeticao, id)).map((h) => h.id)
    : [id];

  const { error } = await supabase.from("agendamentos").update({ status }).in("id", ids);
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
  const { data: a } = await supabase.from("agendamentos").select("inicio, profissional_id, status, grupo_repeticao").eq("id", id).maybeSingle();
  if (!a) return { erro: "Agendamento não encontrado." };
  if (a.status === "em_atendimento" || a.status === "concluido") return { erro: "Agendamento com comanda não pode ser excluído." };
  const ids = texto(dados, "escopo") === "todos" && a.grupo_repeticao
    ? (await horariosAbertosDaSerie(supabase, a.grupo_repeticao, id)).map((h) => h.id)
    : [id];
  const { error } = await supabase.from("agendamentos").delete().in("id", ids);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/agenda");
  redirect(`/agenda?data=${partesSP(a.inicio).data}&prof=${a.profissional_id}`);
}