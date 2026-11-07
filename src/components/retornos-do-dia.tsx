import Link from "next/link";
import { BellRing, MessageCircle } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Cartao } from "@/components/ui";
import { criarClienteServidor } from "@/lib/supabase/server";
import { preencherMensagem } from "@/lib/config";
import { formatarDiaISO, hojeISO, linkWhatsApp } from "@/lib/formato";
import { marcarRetornoAvisado } from "@/app/(sistema)/clientes/actions";

type Linha = {
  id: string; data_retorno: string;
  clientes: { id: string; nome: string; telefone: string | null } | null;
  servicos: { nome: string } | null;
};

/** Clientes que chegaram no dia de retorno e ainda não foram avisadas (só o dono vê). */
export async function RetornosDoDia() {
  const hoje = hojeISO();
  const supabase = await criarClienteServidor();
  const [{ data }, { data: cfg }] = await Promise.all([
    supabase.from("retornos_clientes")
      .select("id, data_retorno, clientes(id, nome, telefone), servicos(nome)")
      .is("avisado_em", null).lte("data_retorno", hoje).order("data_retorno"),
    supabase.from("configuracoes").select("msg_retorno").single(),
  ]);
  const lista = (data ?? []) as unknown as Linha[];
  if (lista.length === 0) return null;

  return (
    <Cartao className="border-rose-claro">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><BellRing size={18} className="text-rose" aria-hidden /> Clientes para avisar do retorno</h2>
      <ul className="divide-y divide-borda text-sm">
        {lista.map((r) => {
          const nome = r.clientes?.nome ?? "";
          const servico = r.servicos?.nome ?? "";
          const msg = preencherMensagem(cfg?.msg_retorno ?? "", { cliente: nome.split(" ")[0], servico });
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-48 flex-1">
                <Link href={`/clientes/${r.clientes?.id}#retorno`} className="font-medium hover:underline">{nome}</Link>
                : hora de avisar que chegou o tempo de retornar ao salão para <strong>{servico}</strong>.
                <span className={`block text-xs ${r.data_retorno < hoje ? "font-semibold text-erro" : "text-suave"}`}>
                  {r.data_retorno === hoje ? "Retorno marcado para hoje" : `Retorno era em ${formatarDiaISO(r.data_retorno)}`}
                </span>
              </span>
              {r.clientes?.telefone ? (
                <a href={linkWhatsApp(r.clientes.telefone, msg)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sucesso px-3 text-sm font-semibold text-white hover:opacity-90">
                  <MessageCircle size={16} aria-hidden /> Avisar
                </a>
              ) : (
                <span className="text-xs text-suave">sem telefone</span>
              )}
              <FormAcao acao={marcarRetornoAvisado}>
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value="/" />
                <BotaoEnviar variante="secundario" pendente="…">Avisei</BotaoEnviar>
              </FormAcao>
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}
