import { Trash2 } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Cartao, Etiqueta } from "@/components/ui";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDataHora, formatarDiaISO, hojeISO } from "@/lib/formato";
import { excluirRetorno, marcarRetornoAvisado } from "../actions";
import { FormRetorno } from "./form-retorno";

type Retorno = { id: string; data_retorno: string; avisado_em: string | null; servicos: { nome: string } | null };
type ServicoLinha = { id: string; nome: string; categorias: { nome: string } | null };

/** Retornos da cliente na ficha (só o dono vê): criar, acompanhar e marcar como avisado. */
export async function RetornosCliente({ clienteId }: { clienteId: string }) {
  const hoje = hojeISO();
  const supabase = await criarClienteServidor();
  const [{ data: retornos }, { data: servicos }] = await Promise.all([
    supabase.from("retornos_clientes").select("id, data_retorno, avisado_em, servicos(nome)").eq("cliente_id", clienteId).order("data_retorno", { ascending: false }),
    supabase.from("servicos").select("id, nome, categorias(nome)").eq("ativo", true).order("nome"),
  ]);
  const lista = (retornos ?? []) as unknown as Retorno[];
  const opcoes = ((servicos ?? []) as unknown as ServicoLinha[])
    .map((s) => ({ id: s.id, nome: s.nome, grupo: s.categorias?.nome ?? "Outros" }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
  const volta = `/clientes/${clienteId}#retorno`;

  return (
    <Cartao>
      <h2 id="retorno" className="mb-1 scroll-mt-4 text-lg font-semibold">Retorno da cliente</h2>
      <p className="mb-4 text-sm text-suave">No dia escolhido, aparece um alerta no Início para avisar a cliente.</p>
      <FormRetorno clienteId={clienteId} servicos={opcoes} hoje={hoje} />
      {lista.length > 0 && (
        <ul className="mt-4 divide-y divide-borda border-t border-borda text-sm">
          {lista.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-40 flex-1">
                <span className="font-medium">{r.servicos?.nome}</span>
                <span className="block text-xs text-suave">
                  Retorno em {formatarDiaISO(r.data_retorno)}{r.avisado_em && ` · aviso feito em ${formatarDataHora(r.avisado_em)}`}
                </span>
              </span>
              {r.avisado_em ? <Etiqueta tom="sucesso">Aviso feito</Etiqueta>
                : r.data_retorno <= hoje ? <Etiqueta tom="aviso">Avisar agora</Etiqueta>
                : <Etiqueta tom="neutro">Agendado</Etiqueta>}
              {!r.avisado_em && r.data_retorno <= hoje && (
                <FormAcao acao={marcarRetornoAvisado}>
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} />
                  <BotaoEnviar variante="secundario" pendente="…">Avisei</BotaoEnviar>
                </FormAcao>
              )}
              <FormAcao acao={excluirRetorno}>
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} />
                <BotaoEnviar variante="fantasma" pendente="…" className="px-2" confirmar="Excluir este retorno?">
                  <Trash2 size={18} aria-label="Excluir retorno" />
                </BotaoEnviar>
              </FormAcao>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
