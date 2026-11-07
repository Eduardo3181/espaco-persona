import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Lock, MessageCircle, Pencil, Receipt, Repeat, Trash2, UserRound } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Cartao } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDuracao, formatarReais, formatarTelefone, linkWhatsApp } from "@/lib/formato";
import { STATUS, dataPorExtenso, partesSP, type StatusAgendamento } from "@/lib/agenda";
import { excluirAgendamento, excluirBloqueio, mudarStatus } from "../actions";
import { horariosAbertosDaSerie } from "../dados";
import { PerguntaSerie } from "./pergunta-serie";
import { abrirComanda } from "../../comandas/actions";
import { obterConfigEquipe, preencherMensagem } from "@/lib/config";

export const metadata: Metadata = { title: "Agendamento" };

type Detalhe = {
  id: string;
  tipo: "atendimento" | "bloqueio";
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  motivo: string | null;
  observacao: string | null;
  grupo_repeticao: string | null;
  grupo_atendimento: string | null;
  profissionais: { id: string; nome: string; cor: string } | null;
  clientes: { id: string; nome: string; telefone: string | null } | null;
  agendamento_servicos: { ordem: number; duracao_min: number; servicos: { nome: string } | null }[];
};

type ComandaFechada = {
  id: string;
  total_itens_centavos: number | null;
  total_desconto_centavos: number;
  total_caixinhas_centavos: number | null;
  comanda_itens: {
    id: string; descricao: string; quantidade: number; valor_total_centavos: number; profissional_id: string;
    profissionais: { nome: string } | null;
  }[];
};

export default async function DetalheAgendamento({ params }: PageProps<"/agenda/[id]">) {
  const { profissional: eu } = await exigirEquipe();
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("agendamentos")
    .select("id, tipo, inicio, fim, status, motivo, observacao, grupo_repeticao, grupo_atendimento, profissionais!agendamentos_profissional_id_fkey(id, nome, cor), clientes(id, nome, telefone), agendamento_servicos(ordem, duracao_min, servicos(nome))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const a = data as unknown as Detalhe;

  // Outros horários do mesmo atendimento (a profissional só enxerga os dela)
  let ligados: { id: string; inicio: string; status: StatusAgendamento; profissionais: { nome: string } | null }[] = [];
  if (a.grupo_atendimento) {
    const { data: lig } = await supabase
      .from("agendamentos")
      .select("id, inicio, status, profissionais!agendamentos_profissional_id_fkey(nome)")
      .eq("grupo_atendimento", a.grupo_atendimento)
      .neq("id", a.id)
      .order("inicio");
    ligados = (lig ?? []) as unknown as typeof ligados;
  }

  // Comanda fechada deste agendamento (só o dono enxerga comandas)
  let comandaFechada: ComandaFechada | null = null;
  if (a.status === "concluido" && eu.papel === "dono") {
    // Atendimento com outros horários ligados: a comanda única pode estar em nome de outro horário
    const { data: cf } = await supabase.from("comandas")
      .select("id, total_itens_centavos, total_desconto_centavos, total_caixinhas_centavos, comanda_itens(id, descricao, quantidade, valor_total_centavos, profissional_id, profissionais!comanda_itens_profissional_id_fkey(nome))")
      .or(a.grupo_atendimento ? `agendamento_id.eq.${a.id},grupo_atendimento.eq.${a.grupo_atendimento}` : `agendamento_id.eq.${a.id}`)
      .eq("status", "fechada")
      .order("fechada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    comandaFechada = cf as unknown as ComandaFechada | null;
  }
  const comandaFechadaId = comandaFechada?.id ?? null;

  const ini = partesSP(a.inicio);
  const fim = partesSP(a.fim);
  const voltar = `/agenda?data=${ini.data}&prof=${a.profissionais?.id ?? ""}`;
  const servicos = [...a.agendamento_servicos].sort((x, y) => x.ordem - y.ordem);
  const st = STATUS[a.status];

  if (a.tipo === "bloqueio") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Link href={voltar} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-rose">
          <ArrowLeft size={18} aria-hidden /> Voltar para a agenda
        </Link>
        <Cartao className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-titulo text-2xl font-bold"><Lock size={20} aria-hidden /> Horário bloqueado</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-suave">Motivo</dt><dd className="font-medium">{a.motivo || "—"}</dd>
            <dt className="text-suave">Profissional</dt><dd>{a.profissionais?.nome}</dd>
            <dt className="text-suave">Quando</dt><dd className="first-letter:uppercase">{dataPorExtenso(ini.data, true)}, {ini.hora} às {fim.hora}</dd>
            {a.grupo_repeticao && <><dt className="text-suave">Repetição</dt><dd>Faz parte de um bloqueio repetido</dd></>}
          </dl>
          <FormAcao acao={excluirBloqueio} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={a.id} />
            <BotaoEnviar variante="perigo" pendente="Excluindo…" confirmar="Excluir este bloqueio?">
              <Trash2 size={16} aria-hidden /> Excluir este dia
            </BotaoEnviar>
          </FormAcao>
          {a.grupo_repeticao && (
            <FormAcao acao={excluirBloqueio}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="escopo" value="futuros" />
              <BotaoEnviar variante="perigo" pendente="Excluindo…" confirmar="Excluir este e todos os próximos bloqueios desta repetição?">
                <Trash2 size={16} aria-hidden /> Excluir este e os próximos
              </BotaoEnviar>
            </FormAcao>
          )}
        </Cartao>
      </div>
    );
  }

  // Agendamento recorrente: quantos horários ainda seriam afetados por "todos"
  const horariosDaSerie = a.grupo_repeticao ? (await horariosAbertosDaSerie(supabase, a.grupo_repeticao, a.id)).length : 0;
  const emSerie = Boolean(a.grupo_repeticao);
  const desmarcadoNaSerie = a.status === "cancelado" || a.status === "faltou";
  // Sem outros horários em aberto, não há o que perguntar ao excluir
  const perguntarAoExcluir = emSerie && (horariosDaSerie > 1 || (horariosDaSerie === 1 && desmarcadoNaSerie));

  const primeiroNome = a.clientes?.nome.split(" ")[0] ?? "";
  const [, mm, dd] = ini.data.split("-");
  const { msgConfirmacao: modelo } = await obterConfigEquipe();
  const msgConfirmacao = preencherMensagem(modelo, {
    cliente: primeiroNome,
    data: `${dataPorExtenso(ini.data).split(",")[0]}, ${dd}/${mm}`,
    hora: ini.hora,
    profissional: a.profissionais?.nome.split(" ")[0] ?? "",
  });
  const editavel = a.status !== "em_atendimento" && a.status !== "concluido";
  const desmarcado = a.status === "cancelado" || a.status === "faltou";


  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={voltar} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-rose">
        <ArrowLeft size={18} aria-hidden /> Voltar para a agenda
      </Link>

      <Cartao className={`flex flex-col gap-4 border-l-4 ${st.borda}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-titulo text-3xl font-bold">{a.clientes?.nome}</h2>
            {a.clientes?.telefone && <p className="text-sm text-suave">{formatarTelefone(a.clientes.telefone)}</p>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.fundo} ${st.texto}`}>{st.rotulo}</span>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-suave">Quando</dt>
          <dd className="font-medium first-letter:uppercase">{dataPorExtenso(ini.data, true)}, {ini.hora} às {fim.hora}</dd>
          <dt className="text-suave">Profissional</dt>
          <dd className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: a.profissionais?.cor }} aria-hidden />{a.profissionais?.nome}</dd>
          <dt className="text-suave">Serviços</dt>
          <dd>
            {comandaFechada ? (
              <div className="flex flex-col gap-1">
                <ul className="flex flex-col gap-1">
                  {comandaFechada.comanda_itens.map((i) => (
                    <li key={i.id} className="flex items-baseline justify-between gap-3">
                      <span>
                        {i.quantidade > 1 && `${i.quantidade}× `}{i.descricao}
                        {i.profissional_id !== a.profissionais?.id && <span className="text-suave"> · {i.profissionais?.nome.split(" ")[0]}</span>}
                      </span>
                      <span className="shrink-0">{formatarReais(i.valor_total_centavos)}</span>
                    </li>
                  ))}
                </ul>
                {comandaFechada.total_desconto_centavos > 0 && (
                  <p className="flex justify-between gap-3 text-suave"><span>Desconto do Pix</span><span>− {formatarReais(comandaFechada.total_desconto_centavos)}</span></p>
                )}
                {(comandaFechada.total_caixinhas_centavos ?? 0) > 0 && (
                  <p className="flex justify-between gap-3 text-suave"><span>Caixinha</span><span>{formatarReais(comandaFechada.total_caixinhas_centavos ?? 0)}</span></p>
                )}
                <p className="mt-1 flex justify-between gap-3 border-t border-borda pt-2 text-base font-bold">
                  <span>Total da comanda</span>
                  <span>{formatarReais((comandaFechada.total_itens_centavos ?? 0) + (comandaFechada.total_caixinhas_centavos ?? 0))}</span>
                </p>
              </div>
            ) : (
              <ul>{servicos.map((s) => <li key={s.ordem}>{s.servicos?.nome} <span className="text-suave">· {formatarDuracao(s.duracao_min)}</span></li>)}</ul>
            )}
          </dd>
          {a.observacao && <><dt className="text-suave">Observação</dt><dd>{a.observacao}</dd></>}
          {emSerie && (
            <>
              <dt className="text-suave">Recorrência</dt>
              <dd className="flex items-center gap-1"><Repeat size={14} aria-hidden /> Faz parte de uma recorrência · {horariosDaSerie} ainda por vir</dd>
            </>
          )}
          {a.grupo_atendimento && (
            <>
              <dt className="text-suave">Junto com</dt>
              <dd>
                {ligados.length === 0 ? "outra profissional (mesmo atendimento, comanda única)" : (
                  <ul>
                    {ligados.map((l) => (
                      <li key={l.id}>
                        <Link href={`/agenda/${l.id}`} className="text-rose hover:underline">
                          {l.profissionais?.nome} às {partesSP(l.inicio).hora}
                        </Link>{" "}
                        <span className="text-xs text-suave">· {STATUS[l.status].rotulo}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="block text-xs text-suave">Mesmo atendimento: a comanda é uma só.</span>
              </dd>
            </>
          )}
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-borda pt-4">
          {a.status === "aguardando" && <BotaoStatus id={a.id} status="confirmado" rotulo="Marcar como confirmado" variante="primario" />}
          {a.status === "confirmado" && <BotaoStatus id={a.id} status="aguardando" rotulo="Voltar para aguardando" />}
          {a.clientes?.telefone && !desmarcado && editavel && (
            <a href={linkWhatsApp(a.clientes.telefone, msgConfirmacao)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sucesso px-4 text-sm font-semibold text-white hover:opacity-90">
              <MessageCircle size={18} aria-hidden /> Pedir confirmação
            </a>
          )}
          {desmarcado && <BotaoStatus id={a.id} status="aguardando" rotulo="Reativar agendamento" variante="primario" />}
        </div>

        <div className="flex flex-wrap gap-2">
          {!desmarcado && a.status !== "concluido" && (
            <FormAcao acao={abrirComanda}>
              <input type="hidden" name="agendamento_id" value={a.id} />
              <BotaoEnviar variante={a.status === "em_atendimento" ? "primario" : "secundario"} pendente="Abrindo…">
                <Receipt size={16} aria-hidden /> {a.status === "em_atendimento" ? "Ver comanda" : "Abrir comanda"}
              </BotaoEnviar>
            </FormAcao>
          )}
          {a.status === "concluido" && comandaFechadaId && (
            <BotaoLink href={`/comandas/${comandaFechadaId}`} variante="secundario">
              <Receipt size={16} aria-hidden /> Ver comanda fechada
            </BotaoLink>
          )}
          {editavel && !desmarcado && (
            <BotaoLink href={`/agenda/${a.id}/editar`} variante="secundario">
              <Pencil size={16} aria-hidden /> Editar / remarcar
            </BotaoLink>
          )}
          {a.clientes && (
              <BotaoLink href={`/clientes/${a.clientes.id}`} variante="fantasma">
                <UserRound size={16} aria-hidden /> Ficha da cliente
              </BotaoLink>
            )}
        </div>

        {editavel && !desmarcado && (
          <div className="flex flex-wrap gap-2 border-t border-borda pt-4">
            {emSerie ? (
              <PerguntaSerie acao={mudarStatus} id={a.id} campos={{ status: "cancelado" }} rotulo="Cliente cancelou" variante="perigo"
                pergunta="A cliente cancelou só este agendamento ou todos?" qtdTodos={horariosDaSerie} />
            ) : (
              <BotaoStatus id={a.id} status="cancelado" rotulo="Cliente cancelou" variante="perigo" confirmar="Marcar que a cliente cancelou? O horário fica livre." />
            )}
            <BotaoStatus id={a.id} status="faltou" rotulo="Cliente faltou" variante="perigo" confirmar="Marcar que a cliente faltou sem avisar? O horário fica livre." />
          </div>
        )}

        {editavel && (
          <FormAcao acao={excluirAgendamento} className="border-t border-borda pt-4">
            <input type="hidden" name="id" value={a.id} />
            <p className="mb-2 text-xs text-suave">
              <CalendarClock size={12} className="inline" aria-hidden /> Use “excluir” só para agendamentos lançados por engano — para cancelamentos, use os botões acima (fica no histórico da cliente).
            </p>
            {!perguntarAoExcluir && (
              <BotaoEnviar variante="fantasma" pendente="Excluindo…" confirmar="Excluir este agendamento de vez? Ele não fica no histórico.">
                <Trash2 size={16} aria-hidden /> Excluir (lançado por engano)
              </BotaoEnviar>
            )}
          </FormAcao>
        )}
        {editavel && perguntarAoExcluir && (
          <PerguntaSerie acao={excluirAgendamento} id={a.id} rotulo="Excluir (lançado por engano)" variante="fantasma"
            pergunta="Excluir de vez só este agendamento ou todos? Eles não ficam no histórico." qtdTodos={horariosDaSerie} />
        )}
      </Cartao>
    </div>
  );
}

function BotaoStatus({ id, status, rotulo, variante = "secundario", confirmar }: {
  id: string; status: StatusAgendamento; rotulo: string; variante?: "primario" | "secundario" | "perigo"; confirmar?: string;
}) {
  return (
    <FormAcao acao={mudarStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <BotaoEnviar variante={variante} confirmar={confirmar}>{rotulo}</BotaoEnviar>
    </FormAcao>
  );
}
