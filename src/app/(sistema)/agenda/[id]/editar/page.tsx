import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Cartao } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { partesSP } from "@/lib/agenda";
import { FormAgendamento } from "../../form-agendamento";
import { profissionaisDaAgenda, servicosParaAgenda } from "../../dados";

export const metadata: Metadata = { title: "Remarcar agendamento" };

export default async function EditarAgendamento({ params }: PageProps<"/agenda/[id]/editar">) {
  const { profissional: eu } = await exigirEquipe();
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: a } = await supabase
    .from("agendamentos")
    .select("id, tipo, profissional_id, inicio, fim, status, observacao, clientes(id, nome, telefone), agendamento_servicos(ordem, servico_id)")
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();
  if (a.tipo !== "atendimento" || a.status === "em_atendimento" || a.status === "concluido") redirect(`/agenda/${id}`);

  const servicosAg = [...(a.agendamento_servicos as { ordem: number; servico_id: string }[])].sort((x, y) => x.ordem - y.ordem).map((s) => s.servico_id);
  const [profissionais, servicos] = await Promise.all([
    profissionaisDaAgenda(supabase, eu),
    servicosParaAgenda(supabase, servicosAg),
  ]);
  const ini = partesSP(a.inicio);
  const duracao = Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000);

  return (
    <Cartao className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Editar / remarcar</h2>
      <FormAgendamento
        profissionais={profissionais}
        podeEscolherProf={eu.papel === "dono"}
        servicos={servicos}
        inicial={{
          id: a.id,
          profissional_id: a.profissional_id,
          cliente: a.clientes as unknown as { id: string; nome: string; telefone: string | null },
          data: ini.data,
          hora: ini.hora,
          servicos: servicosAg,
          duracao,
          observacao: a.observacao ?? "",
        }}
        voltarHref={`/agenda/${a.id}`}
      />
    </Cartao>
  );
}
