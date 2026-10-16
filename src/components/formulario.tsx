"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { classeBotao } from "@/components/ui";

/** Resultado de uma ação de formulário: mensagem de erro para mostrar na tela. */
export type EstadoForm = { erro?: string } | null;
export type AcaoForm = (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>;

/** Formulário que envia para uma Server Action e mostra o erro, se houver. */
export function FormAcao({ acao, children, className = "" }: { acao: AcaoForm; children: ReactNode; className?: string }) {
  const [estado, enviar] = useActionState(acao, null);
  return (
    <form action={enviar} className={className}>
      {estado?.erro && (
        <p role="alert" className="mb-4 rounded-lg border border-erro/30 bg-[#F6E3E3] px-3 py-2 text-sm text-erro">
          {estado.erro}
        </p>
      )}
      {children}
    </form>
  );
}

/** Botão de enviar que mostra "Salvando…" enquanto espera. */
export function BotaoEnviar({
  children,
  variante = "primario",
  pendente = "Salvando…",
  className = "",
  confirmar,
}: {
  children: ReactNode;
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
  pendente?: string;
  className?: string;
  confirmar?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={classeBotao(variante, className)}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {pending ? pendente : children}
    </button>
  );
}
