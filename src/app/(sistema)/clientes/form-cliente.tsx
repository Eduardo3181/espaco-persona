import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Campo, classeInput } from "@/components/ui";
import { MESES, formatarTelefone, hojeISO } from "@/lib/formato";
import { salvarCliente } from "./actions";

export type ClienteCadastro = {
  id: string;
  nome: string;
  telefone: string | null;
  aniversario_dia: number | null;
  aniversario_mes: number | null;
  aniversario_ano: number | null;
  cliente_desde: string;
};

/** Formulário de cadastro/edição dos dados básicos da cliente. */
export function FormCliente({ cliente }: { cliente?: ClienteCadastro }) {
  return (
    <FormAcao acao={salvarCliente} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={cliente?.id ?? ""} />
      <Campo rotulo="Nome completo" className="sm:col-span-2">
        <input name="nome" required autoComplete="off" defaultValue={cliente?.nome} className={classeInput} />
      </Campo>
      <Campo rotulo="Telefone (WhatsApp)" dica="Com DDD, ex.: (11) 98765-4321">
        <input name="telefone" type="tel" inputMode="tel" autoComplete="off"
          defaultValue={formatarTelefone(cliente?.telefone ?? null)} className={classeInput} />
      </Campo>
      <Campo rotulo="Cliente desde">
        <input name="cliente_desde" type="date" defaultValue={cliente?.cliente_desde ?? hojeISO()} className={classeInput} />
      </Campo>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Aniversário</legend>
        <div className="grid grid-cols-[5rem_1fr_6rem] gap-2">
          <input name="aniversario_dia" type="number" min={1} max={31} placeholder="Dia" aria-label="Dia do aniversário"
            defaultValue={cliente?.aniversario_dia ?? ""} className={classeInput} />
          <select name="aniversario_mes" defaultValue={cliente?.aniversario_mes ?? ""} aria-label="Mês do aniversário" className={classeInput}>
            <option value="">Mês</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input name="aniversario_ano" type="number" min={1900} max={2100} placeholder="Ano" aria-label="Ano de nascimento (opcional)"
            defaultValue={cliente?.aniversario_ano ?? ""} className={classeInput} />
        </div>
        <p className="mt-1 text-xs text-suave">O ano é opcional.</p>
      </fieldset>
      <div className="flex gap-3 sm:col-span-2">
        <BotaoEnviar>Salvar</BotaoEnviar>
        <BotaoLink href={cliente ? `/clientes/${cliente.id}` : "/clientes"} variante="secundario">Cancelar</BotaoLink>
      </div>
    </FormAcao>
  );
}
