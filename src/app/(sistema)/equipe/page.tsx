import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Etiqueta, classeInput } from "@/components/ui";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { salvarProfissional } from "./actions";

export const metadata: Metadata = { title: "Equipe" };

type Profissional = {
  id: string; nome: string; email: string | null; funcao: string | null; papel: "dono" | "profissional";
  recebe_comissao: boolean; cor: string; ativo: boolean; usuario_id: string | null; ordem: number;
};

export default async function PaginaEquipe({ searchParams }: PageProps<"/equipe">) {
  await exigirDono();
  const params = await searchParams;
  const editar = typeof params.editar === "string" ? params.editar : undefined;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("profissionais").select("*").order("ativo", { ascending: false }).order("ordem").order("nome");
  const equipe = (data ?? []) as Profissional[];
  const emEdicao = editar === "novo" ? null : equipe.find((p) => p.id === editar);
  const mostrarForm = editar === "novo" || Boolean(emEdicao);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-suave">Quem atende no salão. O login é liberado pelo e-mail cadastrado aqui.</p>
        {!mostrarForm && (
          <BotaoLink href="/equipe?editar=novo">
            <Plus size={18} aria-hidden /> Nova profissional
          </BotaoLink>
        )}
      </div>

      {mostrarForm && (
        <Cartao>
          <h2 className="mb-4 text-lg font-semibold">{emEdicao ? `Editar ${emEdicao.nome}` : "Nova profissional"}</h2>
          <FormAcao key={editar} acao={salvarProfissional} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
            <Campo rotulo="Nome">
              <input name="nome" required defaultValue={emEdicao?.nome} className={classeInput} />
            </Campo>
            <Campo rotulo="Função" dica="Ex.: cabeleireira, manicure">
              <input name="funcao" defaultValue={emEdicao?.funcao ?? ""} className={classeInput} />
            </Campo>
            <Campo rotulo="E-mail de acesso" dica="Opcional. Com o e-mail, ela pode ter login no sistema.">
              <input name="email" type="email" defaultValue={emEdicao?.email ?? ""} className={classeInput} />
            </Campo>
            <Campo rotulo="Perfil">
              <select name="papel" defaultValue={emEdicao?.papel ?? "profissional"} className={classeInput}>
                <option value="profissional">Profissional</option>
                <option value="dono">Dono (acesso total)</option>
              </select>
            </Campo>
            <div className="flex gap-4">
              <Campo rotulo="Cor na agenda">
                <input name="cor" type="color" defaultValue={emEdicao?.cor ?? "#96604A"} className="h-11 w-24 cursor-pointer rounded-lg border border-borda bg-cartao" />
              </Campo>
              <Campo rotulo="Posição na agenda" dica="1 = primeira coluna">
                <input name="ordem" type="number" min={1} max={99} required defaultValue={emEdicao?.ordem ?? equipe.length + 1}
                  className={classeInput.replace("w-full ", "") + " w-24"} />
              </Campo>
            </div>
            <div className="flex flex-col justify-center gap-2 text-sm">
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="recebe_comissao" defaultChecked={emEdicao?.recebe_comissao ?? true} className="size-5 accent-rose" />
                Recebe comissão
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="ativo" defaultChecked={emEdicao?.ativo ?? true} className="size-5 accent-rose" />
                Ativa (desmarque quando sair do salão)
              </label>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <BotaoEnviar>Salvar</BotaoEnviar>
              <BotaoLink href="/equipe" variante="secundario">Cancelar</BotaoLink>
            </div>
          </FormAcao>
        </Cartao>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {equipe.map((p) => (
          <li key={p.id}>
            <Cartao className={`flex h-full flex-col gap-3 ${p.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <span className="mt-1 size-4 shrink-0 rounded-full" style={{ background: p.cor }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.nome}</p>
                  <p className="text-sm text-suave">{p.funcao ?? "—"}</p>
                  <p className="truncate text-xs text-suave">{p.email ?? "sem e-mail"}</p>
                </div>
                <BotaoLink href={`/equipe?editar=${p.id}`} variante="fantasma" className="px-2" aria-label={`Editar ${p.nome}`}>
                  <Pencil size={18} />
                </BotaoLink>
              </div>
              <div className="flex flex-wrap gap-2">
                <Etiqueta tom={p.papel === "dono" ? "rose" : "neutro"}>{p.papel === "dono" ? "Dono" : "Profissional"}</Etiqueta>
                {p.usuario_id ? <Etiqueta tom="sucesso">Login ativo</Etiqueta> : <Etiqueta tom="aviso">Sem login</Etiqueta>}
                {!p.recebe_comissao && <Etiqueta>Sem comissão</Etiqueta>}
                {!p.ativo && <Etiqueta tom="erro">Inativa</Etiqueta>}
              </div>
            </Cartao>
          </li>
        ))}
      </ul>
    </div>
  );
}
