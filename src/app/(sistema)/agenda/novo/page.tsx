import type { Metadata } from "next";
import { Cartao } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/formato";
import { dataValida } from "@/lib/agenda";
import { FormAgendamento } from "../form-agendamento";
import { profissionaisDaAgenda, servicosParaAgenda } from "../dados";

export const metadata: Metadata = { title: "Novo agendamento" };

export default async function NovoAgendamento({ searchParams }: PageProps<"/agenda/novo">) {
  const { profissional: eu } = await exigirEquipe();
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  const [profissionais, servicos] = await Promise.all([profissionaisDaAgenda(supabase, eu), servicosParaAgenda(supabase)]);

  const data = dataValida(sp.data) ? sp.data : hojeISO();
  const hora = typeof sp.hora === "string" && /^\d{2}:\d{2}$/.test(sp.hora) ? sp.hora : "09:00";
  const prof = profissionais.find((p) => p.id === sp.prof)?.id ?? (eu.papel === "dono" ? "" : eu.id);

  // Vindo da ficha da cliente
  let cliente = null;
  if (typeof sp.cliente === "string") {
    const { data: c } = await supabase.from("clientes").select("id, nome, telefone").eq("id", sp.cliente).maybeSingle();
    cliente = c;
  }

  return (
    <Cartao className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Novo agendamento</h2>
      <FormAgendamento
        profissionais={profissionais}
        podeEscolherProf={eu.papel === "dono"}
        servicos={servicos}
        inicial={{ profissional_id: prof, cliente, data, hora, servicos: [] }}
        voltarHref={`/agenda?data=${data}${prof ? `&prof=${prof}` : ""}`}
      />
    </Cartao>
  );
}
