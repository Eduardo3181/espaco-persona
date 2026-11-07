"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BuscaItem, type OpcaoBusca } from "@/components/busca-item";
import { Campo, classeInput } from "@/components/ui";
import { formatarDiaISO } from "@/lib/formato";
import { DIAS_SEMANA, diaDaSemana, somarDias } from "@/lib/agenda";
import { somarMeses } from "@/lib/gestao";
import { criarRetorno } from "../actions";

type Modo = "semanas" | "meses" | "personalizar";

/** Escolhe o serviço e daqui a quanto tempo a cliente deve voltar. */
export function FormRetorno({ clienteId, servicos, hoje }: { clienteId: string; servicos: OpcaoBusca[]; hoje: string }) {
  const [servico, setServico] = useState<OpcaoBusca | null>(null);
  const [modo, setModo] = useState<Modo>("semanas");
  const [quantidade, setQuantidade] = useState("4");
  const [data, setData] = useState("");

  const qtd = Number(quantidade);
  const qtdValida = Number.isInteger(qtd) && qtd > 0 && qtd <= 120;
  const alerta = modo === "personalizar" ? data
    : !qtdValida ? ""
    : modo === "semanas" ? somarDias(hoje, qtd * 7) : somarMeses(hoje, qtd);

  return (
    <FormAcao acao={criarRetorno} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <div className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Serviço</span>
        {servico ? (
          <span className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-rose-claro bg-agendado-fundo/50 pl-3">
            <input type="hidden" name="servico_id" value={servico.id} />
            <strong className="min-w-0 truncate">{servico.nome}</strong>
            <button type="button" onClick={() => setServico(null)} aria-label="Trocar serviço"
              className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro"><X size={18} /></button>
          </span>
        ) : (
          <BuscaItem rotulo="Buscar serviço" placeholder="Digite o serviço…" opcoes={servicos}
            aoEscolher={(id) => setServico(servicos.find((s) => s.id === id) ?? null)} />
        )}
      </div>
      <Campo rotulo="Retornar em">
        <select name="modo" value={modo} onChange={(e) => setModo(e.target.value as Modo)} className={classeInput}>
          <option value="semanas">Semanas</option>
          <option value="meses">Meses</option>
          <option value="personalizar">Personalizar a data</option>
        </select>
      </Campo>
      {modo === "personalizar" ? (
        <Campo rotulo="Data do retorno">
          <input name="data" type="date" required min={hoje} value={data} onChange={(e) => setData(e.target.value)} className={classeInput} />
        </Campo>
      ) : (
        <Campo rotulo={modo === "semanas" ? "Quantas semanas" : "Quantos meses"}>
          <input name="quantidade" type="number" required min={1} max={120} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={classeInput} />
        </Campo>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <BotaoEnviar>Criar alerta</BotaoEnviar>
        {alerta && (
          <p className="text-sm text-suave">
            Alerta em <strong className="text-texto">{DIAS_SEMANA[diaDaSemana(alerta)]}, {formatarDiaISO(alerta)}</strong>
          </p>
        )}
      </div>
    </FormAcao>
  );
}
