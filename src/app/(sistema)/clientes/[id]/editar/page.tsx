import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, Cartao, classeInput } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { excluirCliente } from "../../actions";
import { FormCliente, type ClienteCadastro } from "../../form-cliente";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }: PageProps<"/clientes/[id]/editar">) {
  const { profissional } = await exigirEquipe();
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("clientes")
    .select("id, nome, telefone, aniversario_dia, aniversario_mes, aniversario_ano, cliente_desde")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const cliente = data as ClienteCadastro;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Cartao>
        <h2 className="mb-4 text-lg font-semibold">Editar {cliente.nome}</h2>
        <FormCliente cliente={cliente} />
      </Cartao>

      {profissional.papel === "dono" && (
        <Cartao className="border-erro/30">
          <h2 className="text-lg font-semibold text-erro">Excluir cliente</h2>
          <p className="mt-1 mb-4 text-sm text-suave">
            Use quando a cliente pedir a exclusão dos dados dela (LGPD). Apaga para sempre o cadastro, a ficha técnica,
            as anotações, o saldo e os agendamentos. As comandas já fechadas continuam no financeiro, sem o nome dela.
            Não dá para desfazer.
          </p>
          <FormAcao acao={excluirCliente} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="id" value={cliente.id} />
            <Campo rotulo="Digite EXCLUIR para confirmar" className="flex-1">
              <input name="confirmacao" autoComplete="off" className={classeInput} />
            </Campo>
            <BotaoEnviar variante="perigo" pendente="Excluindo…" confirmar={`Excluir ${cliente.nome} para sempre?`}>
              Excluir para sempre
            </BotaoEnviar>
          </FormAcao>
        </Cartao>
      )}
    </div>
  );
}
