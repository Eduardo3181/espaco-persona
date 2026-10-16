import type { Metadata } from "next";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, classeInput } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/formato";
import { dataValida } from "@/lib/agenda";
import { profissionaisDaAgenda } from "../dados";
import { salvarBloqueio } from "../actions";

export const metadata: Metadata = { title: "Bloquear horário" };

const MOTIVOS = ["Almoço", "Folga", "Ausência", "Médico", "Curso"];

export default async function BloquearHorario({ searchParams }: PageProps<"/agenda/bloquear">) {
  const { profissional: eu } = await exigirEquipe();
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  const profissionais = await profissionaisDaAgenda(supabase, eu);
  const data = dataValida(sp.data) ? sp.data : hojeISO();
  const prof = profissionais.find((p) => p.id === sp.prof)?.id ?? (eu.papel === "dono" ? "" : eu.id);

  return (
    <Cartao className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold">Bloquear horário</h2>
      <p className="mb-4 text-sm text-suave">Para almoço, folga, ausência… Ninguém consegue agendar nesse horário.</p>
      <FormAcao acao={salvarBloqueio} className="grid gap-4 sm:grid-cols-2">
        {eu.papel === "dono" ? (
          <Campo rotulo="Profissional">
            <select name="profissional_id" required defaultValue={prof} className={classeInput}>
              <option value="" disabled>Escolha…</option>
              {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        ) : (
          <input type="hidden" name="profissional_id" value={eu.id} />
        )}
        <Campo rotulo="Motivo" dica={`Ex.: ${MOTIVOS.join(", ")}`}>
          <input name="motivo" required list="motivos" className={classeInput} />
          <datalist id="motivos">{MOTIVOS.map((m) => <option key={m} value={m} />)}</datalist>
        </Campo>
        <Campo rotulo="Data">
          <input name="data" type="date" required defaultValue={data} className={classeInput} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Das">
            <input name="hora_inicio" type="time" required step={300} defaultValue="12:00" className={classeInput} />
          </Campo>
          <Campo rotulo="Até">
            <input name="hora_fim" type="time" required step={300} defaultValue="13:00" className={classeInput} />
          </Campo>
        </div>
        <fieldset className="grid gap-3 rounded-lg border border-borda p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Repetir</legend>
          <Campo rotulo="Frequência">
            <select name="repetir" defaultValue="" className={classeInput}>
              <option value="">Não repetir (só este dia)</option>
              <option value="diario">Todos os dias</option>
              <option value="semanal">Toda semana, no mesmo dia</option>
            </select>
          </Campo>
          <Campo rotulo="Até o dia" dica="Obrigatório se for repetir">
            <input name="ate" type="date" className={classeInput} />
          </Campo>
        </fieldset>
        <div className="flex gap-3 sm:col-span-2">
          <BotaoEnviar>Bloquear</BotaoEnviar>
          <BotaoLink href={`/agenda?data=${data}${prof ? `&prof=${prof}` : ""}`} variante="secundario">Cancelar</BotaoLink>
        </div>
      </FormAcao>
    </Cartao>
  );
}
