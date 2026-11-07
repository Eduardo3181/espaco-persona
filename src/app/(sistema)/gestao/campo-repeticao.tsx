"use client";

import { useState } from "react";
import { CalendarClock, Layers, Repeat } from "lucide-react";
import { Campo, classeInput } from "@/components/ui";

type Tipo = "unica" | "recorrente" | "parcelada";

const OPCOES: { id: Tipo; rotulo: string; icone: typeof Repeat }[] = [
  { id: "unica", rotulo: "Conta única", icone: CalendarClock },
  { id: "recorrente", rotulo: "Recorrente", icone: Repeat },
  { id: "parcelada", rotulo: "Parcelada", icone: Layers },
];

/** Botões para a conta ser única, recorrente (todo mês) ou parcelada. */
export function CampoRepeticao() {
  const [tipo, setTipo] = useState<Tipo>("unica");
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">Esta conta é</legend>
      <input type="hidden" name="repeticao" value={tipo} />
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Tipo de conta">
        {OPCOES.map(({ id, rotulo, icone: Icone }) => (
          <button key={id} type="button" role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-sm font-semibold ${tipo === id ? "bg-escuro text-sobre-escuro" : "border border-borda bg-cartao"}`}>
            <Icone size={16} aria-hidden /> {rotulo}
          </button>
        ))}
      </div>
      {tipo === "recorrente" && (
        <p className="text-sm text-suave">
          Repete todo mês, no mesmo dia, sem data para acabar. Os próximos 12 meses já ficam lançados. Se a mesma conta já existir num mês, ela é ligada à recorrência, sem duplicar.
        </p>
      )}
      {tipo === "parcelada" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Número de parcelas">
              <input name="parcelas_total" type="number" required min={2} max={120} defaultValue={2} className={classeInput} />
            </Campo>
            <Campo rotulo="Esta é a parcela nº" dica="Use 1 para uma compra nova.">
              <input name="parcela_atual" type="number" required min={1} max={120} defaultValue={1} className={classeInput} />
            </Campo>
          </div>
          <p className="text-sm text-suave">O valor da Visão é o de cada parcela. Cada parcela vai para o seu mês, a partir do vencimento acima.</p>
        </>
      )}
    </fieldset>
  );
}
