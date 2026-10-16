"use client";

import { createContext, startTransition, useActionState, useContext, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { classeBotao } from "@/components/ui";

/** Resultado de uma ação de formulário: mensagem de erro para mostrar na tela. */
export type EstadoForm = { erro?: string } | null;
export type AcaoForm = (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>;

const Pendente = createContext(false);

/**
 * Envia o formulário para a ação sem que o React limpe os campos
 * (assim, se aparecer um erro, o que foi digitado continua lá).
 */
export function useEnvioSemLimpar(acao: AcaoForm) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => enviar(dados));
  };
  return { estado, aoEnviar, pendente };
}

/** Formulário que envia para uma Server Action e mostra o erro, se houver. */
export function FormAcao({ acao, children, className = "" }: { acao: AcaoForm; children: ReactNode; className?: string }) {
  const { estado, aoEnviar, pendente } = useEnvioSemLimpar(acao);
  return (
    <form onSubmit={aoEnviar} className={className}>
      <Pendente value={pendente}>
        <MensagemErro erro={estado?.erro} />
        {children}
      </Pendente>
    </form>
  );
}

export function MensagemErro({ erro }: { erro?: string }) {
  if (!erro) return null;
  return (
    <p role="alert" className="col-span-full mb-4 rounded-lg border border-erro/30 bg-[#F6E3E3] px-3 py-2 text-sm text-erro">
      {erro}
    </p>
  );
}

/** Botão de enviar que mostra "Salvando…" enquanto espera. */
export function BotaoEnviar({
  children,
  variante = "primario",
  pendente = "Salvando…",
  className = "",
  confirmar,
  pendenteExterno,
}: {
  children: ReactNode;
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
  pendente?: string;
  className?: string;
  confirmar?: string;
  pendenteExterno?: boolean;
}) {
  const { pending } = useFormStatus();
  const doForm = useContext(Pendente);
  const ocupado = pending || doForm || Boolean(pendenteExterno);
  return (
    <button
      type="submit"
      disabled={ocupado}
      className={classeBotao(variante, className)}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {ocupado ? pendente : children}
    </button>
  );
}
