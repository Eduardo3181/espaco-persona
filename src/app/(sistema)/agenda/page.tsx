import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import { BotaoLink } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/formato";
import {
  HORA_ABRE, HORA_FECHA, SLOT_MIN, STATUS, dataPorExtenso, dataValida, horariosDaGrade, paraTimestamp, partesSP, somarDias,
  type StatusAgendamento,
} from "@/lib/agenda";
import { MiniCalendario } from "./mini-calendario";

export const metadata: Metadata = { title: "Agenda" };

const ALTURA_SLOT = 48; // px por 30 minutos
const PX_POR_MIN = ALTURA_SLOT / SLOT_MIN;

type Agendamento = {
  id: string;
  tipo: "atendimento" | "bloqueio";
  profissional_id: string;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  motivo: string | null;
  clientes: { nome: string } | null;
  agendamento_servicos: { ordem: number; servicos: { nome: string } | null }[];
};

export default async function PaginaAgenda({ searchParams }: PageProps<"/agenda">) {
  const { profissional: eu } = await exigirEquipe();
  const ehDono = eu.papel === "dono";
  const sp = await searchParams;
  const hoje = hojeISO();
  const data = dataValida(sp.data) ? sp.data : hoje;
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : data.slice(0, 7);

  const supabase = await criarClienteServidor();
  const [{ data: profs }, { data: ags }] = await Promise.all([
    ehDono
      ? supabase.from("profissionais").select("id, nome, cor").eq("ativo", true).order("nome")
      : supabase.from("profissionais").select("id, nome, cor").eq("id", eu.id),
    supabase
      .from("agendamentos")
      .select("id, tipo, profissional_id, inicio, fim, status, motivo, clientes(nome), agendamento_servicos(ordem, servicos(nome))")
      .gte("inicio", paraTimestamp(data, "00:00"))
      .lt("inicio", paraTimestamp(somarDias(data, 1), "00:00"))
      .order("inicio"),
  ]);
  const profissionais = profs ?? [];
  const agendamentos = (ags ?? []) as unknown as Agendamento[];
  const ativos = agendamentos.filter((a) => a.status !== "cancelado" && a.status !== "faltou");
  const desmarcados = agendamentos.filter((a) => a.status === "cancelado" || a.status === "faltou");

  const profSel = profissionais.find((p) => p.id === sp.prof)?.id ?? profissionais[0]?.id;
  const href = (p: { data?: string; mes?: string; prof?: string }) => {
    const u = new URLSearchParams();
    u.set("data", p.data ?? data);
    if (p.mes) u.set("mes", p.mes);
    const prof = p.prof ?? profSel;
    if (prof) u.set("prof", prof);
    return `/agenda?${u}`;
  };

  const horarios = horariosDaGrade();
  const agora = partesSP(new Date());
  const linhaAgora = data === hoje && agora.minutos >= HORA_ABRE * 60 && agora.minutos < HORA_FECHA * 60
    ? (agora.minutos - HORA_ABRE * 60) * PX_POR_MIN
    : null;

  const nomesServicos = (a: Agendamento) =>
    [...a.agendamento_servicos].sort((x, y) => x.ordem - y.ordem).map((s) => s.servicos?.nome).filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Lateral: calendário e ações */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
        <div className="flex gap-2">
          <BotaoLink href={`/agenda/novo?data=${data}${profSel ? `&prof=${profSel}` : ""}`} className="flex-1">
            <Plus size={18} aria-hidden /> Agendar
          </BotaoLink>
          <BotaoLink href={`/agenda/bloquear?data=${data}${profSel ? `&prof=${profSel}` : ""}`} variante="secundario" className="flex-1">
            <Lock size={16} aria-hidden /> Bloquear
          </BotaoLink>
        </div>
        <div className="hidden lg:block">
          <MiniCalendario selecionado={data} hoje={hoje} mes={mes} href={href} />
        </div>
        <Legenda />
      </aside>

      <section className="min-w-0 flex-1">
        {/* Navegação do dia */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={href({ data: somarDias(data, -1) })} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao hover:border-rose-claro" aria-label="Dia anterior">
            <ChevronLeft size={20} />
          </Link>
          <Link href={href({ data: somarDias(data, 1) })} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao hover:border-rose-claro" aria-label="Próximo dia">
            <ChevronRight size={20} />
          </Link>
          {data !== hoje && (
            <Link href={href({ data: hoje })} className="flex min-h-11 items-center rounded-lg border border-borda bg-cartao px-4 text-sm font-semibold hover:border-rose-claro">Hoje</Link>
          )}
          <h2 className="font-titulo text-2xl font-bold first-letter:uppercase">{dataPorExtenso(data, true)}</h2>
          <form action="/agenda" className="ml-auto lg:hidden">
            {profSel && <input type="hidden" name="prof" value={profSel} />}
            <label className="sr-only" htmlFor="ir-data">Ir para a data</label>
            <input id="ir-data" type="date" name="data" defaultValue={data} className="min-h-11 rounded-lg border border-borda bg-cartao px-2 text-sm" />
            <button className="ml-1 min-h-11 rounded-lg bg-rose px-3 text-sm font-semibold text-white">Ir</button>
          </form>
        </div>

        {/* Abas por profissional (celular) */}
        {profissionais.length > 1 && (
          <nav className="mb-3 flex gap-1 overflow-x-auto md:hidden" aria-label="Profissional">
            {profissionais.map((p) => (
              <Link key={p.id} href={href({ prof: p.id })} aria-current={p.id === profSel ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${
                  p.id === profSel ? "bg-escuro text-sobre-escuro" : "border border-borda bg-cartao"
                }`}>
                <span className="size-3 rounded-full" style={{ background: p.cor }} aria-hidden /> {p.nome.split(" ")[0]}
              </Link>
            ))}
          </nav>
        )}

        {/* Grade */}
        <div className="overflow-x-auto rounded-xl border border-borda bg-cartao">
          <div className="flex min-w-full">
            <div className="w-14 shrink-0 border-r border-borda">
              <div className="h-12 border-b border-borda" />
              {horarios.map((h) => (
                <div key={h} className="flex items-start justify-end pr-2 text-xs text-suave" style={{ height: ALTURA_SLOT }}>
                  <span className="-mt-2 bg-cartao">{h.endsWith(":00") ? h : ""}</span>
                </div>
              ))}
            </div>

            {profissionais.map((p) => (
              <div key={p.id} className={`min-w-44 flex-1 border-r border-borda last:border-r-0 ${p.id === profSel ? "" : "hidden md:block"}`}>
                <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-borda bg-cartao px-3">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: p.cor }} aria-hidden />
                  <span className="truncate text-sm font-semibold">{p.nome}</span>
                </div>
                <div className="relative" style={{ height: horarios.length * ALTURA_SLOT }}>
                  {/* horários livres (clique para agendar) */}
                  {horarios.map((h, i) => (
                    <Link key={h} href={`/agenda/novo?data=${data}&hora=${h}&prof=${p.id}`}
                      className={`absolute inset-x-0 block hover:bg-agendado-fundo/50 ${i % 2 ? "border-b border-borda" : "border-b border-dashed border-borda/60"}`}
                      style={{ top: i * ALTURA_SLOT, height: ALTURA_SLOT }}
                      aria-label={`Agendar ${p.nome} às ${h}`} tabIndex={-1} />
                  ))}

                  {ativos.filter((a) => a.profissional_id === p.id).map((a) => {
                    const ini = partesSP(a.inicio);
                    const fim = partesSP(a.fim);
                    const topoMin = Math.max(ini.minutos, HORA_ABRE * 60) - HORA_ABRE * 60;
                    const fimMin = Math.min(fim.data === data ? fim.minutos : 24 * 60, HORA_FECHA * 60) - HORA_ABRE * 60;
                    if (fimMin <= 0 || topoMin >= (HORA_FECHA - HORA_ABRE) * 60) return null;
                    const altura = Math.max((fimMin - topoMin) * PX_POR_MIN, 22);
                    const bloqueio = a.tipo === "bloqueio";
                    const st = STATUS[a.status];
                    return (
                      <Link key={a.id} href={`/agenda/${a.id}`}
                        className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-xs shadow-sm transition hover:brightness-95 ${
                          bloqueio ? "border-suave bg-[repeating-linear-gradient(135deg,#EEEBE8,#EEEBE8_6px,#E6DFDA_6px,#E6DFDA_12px)] text-suave" : `${st.fundo} ${st.borda}`
                        }`}
                        style={{ top: topoMin * PX_POR_MIN + 1, height: altura - 2 }}>
                        <span className="font-semibold">{ini.hora}–{fim.hora}</span>{" "}
                        {bloqueio ? (
                          <span className="font-semibold"><Lock size={11} className="inline" aria-hidden /> {a.motivo || "Bloqueado"}</span>
                        ) : (
                          <>
                            <span className={`font-semibold ${st.texto}`}>{a.clientes?.nome}</span>
                            <span className="block truncate text-texto/80">{nomesServicos(a)}</span>
                          </>
                        )}
                      </Link>
                    );
                  })}

                  {linhaAgora !== null && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-erro" style={{ top: linhaAgora }} aria-hidden />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {desmarcados.length > 0 && (
          <div className="mt-4 rounded-xl border border-borda bg-cartao p-4">
            <h3 className="mb-2 text-sm font-semibold">Desmarcados neste dia</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {desmarcados.map((a) => (
                <li key={a.id}>
                  <Link href={`/agenda/${a.id}`} className="hover:underline">
                    <span className="text-suave">{partesSP(a.inicio).hora}</span> {a.clientes?.nome} —{" "}
                    <span className="font-semibold text-erro">{STATUS[a.status].rotulo}</span>
                    {ehDono && <span className="text-suave"> · {profissionais.find((p) => p.id === a.profissional_id)?.nome.split(" ")[0]}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Legenda() {
  const itens: StatusAgendamento[] = ["aguardando", "confirmado", "em_atendimento", "concluido"];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-borda bg-cartao p-3 text-xs lg:flex-col">
      {itens.map((s) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`size-3 rounded-sm border-l-4 ${STATUS[s].fundo} ${STATUS[s].borda}`} aria-hidden /> {STATUS[s].rotulo}
        </li>
      ))}
      <li className="flex items-center gap-2"><span className="size-3 rounded-sm bg-borda" aria-hidden /> Horário bloqueado</li>
    </ul>
  );
}
