"use client";

import { useState } from "react";
import { BotaoEnviar, FormAcao, type AcaoForm } from "@/components/formulario";
import { classeBotao } from "@/components/ui";

/** Botão de um agendamento recorrente: antes de agir, pergunta se vale só para este ou para todos. */
export function PerguntaSerie({ acao, id, campos = {}, rotulo, pergunta, qtdTodos, variante }: {
  acao: AcaoForm;
  id: string;
  campos?: Record<string, string>;
  rotulo: string;
  pergunta: string;
  qtdTodos: number;
  variante: "perigo" | "fantasma";
}) {
  const [aberta, setAberta] = useState(false);
  if (!aberta) {
    return <button type="button" onClick={() => setAberta(true)} className={classeBotao(variante)}>{rotulo}</button>;
  }

  const opcao = (escopo: "este" | "todos", texto: string) => (
    <FormAcao acao={acao}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="escopo" value={escopo} />
      {Object.entries(campos).map(([nome, valor]) => <input key={nome} type="hidden" name={nome} value={valor} />)}
      <BotaoEnviar variante="perigo">{texto}</BotaoEnviar>
    </FormAcao>
  );

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-erro/30 p-3">
      <p className="text-sm font-medium">{pergunta}</p>
      <div className="flex flex-wrap gap-2">
        {opcao("este", "Só este")}
        {opcao("todos", `Todos (${qtdTodos} ainda por vir)`)}
        <button type="button" onClick={() => setAberta(false)} className={classeBotao("secundario")}>Voltar</button>
      </div>
      <p className="text-xs text-suave">Os que já foram atendidos ou desmarcados não mudam.</p>
    </div>
  );
}
