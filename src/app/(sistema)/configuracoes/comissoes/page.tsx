import type { Metadata } from "next";
import Link from "next/link";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Cartao, Vazio, classeInput } from "@/components/ui";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDataHora, formatarPercentual } from "@/lib/formato";
import type { RegraComissao } from "@/lib/comissao";
import { salvarRegras } from "./actions";

export const metadata: Metadata = { title: "Regras de comissão" };

const paraCampo = (n?: number) => (n === undefined ? "" : String(n).replace(".", ","));

export default async function PaginaRegras({ searchParams }: PageProps<"/configuracoes/comissoes">) {
  await exigirDono();
  const { salvo } = await searchParams;
  const supabase = await criarClienteServidor();
  const [profs, cats, servs, regs, log] = await Promise.all([
    supabase.from("profissionais").select("id, nome, usuario_id, recebe_comissao, ativo").order("ordem").order("nome"),
    supabase.from("categorias").select("id, nome").eq("tipo", "servico").eq("ativo", true).order("nome"),
    supabase.from("servicos").select("id, nome"),
    supabase.from("regras_comissao").select("*"),
    supabase.from("log_auditoria").select("*").eq("tabela", "regras_comissao").order("criado_em", { ascending: false }).limit(10),
  ]);

  const todos = profs.data ?? [];
  const profissionais = todos.filter((p) => p.ativo && p.recebe_comissao);
  const categorias = cats.data ?? [];
  const regras = (regs.data ?? []) as RegraComissao[];
  const nomeServico = new Map((servs.data ?? []).map((s) => [s.id, s.nome]));
  const nomeProf = new Map(todos.map((p) => [p.id, p.nome]));
  const nomeUsuario = new Map(todos.filter((p) => p.usuario_id).map((p) => [p.usuario_id, p.nome]));
  const regra = (prof: string, tipo: string, cat: string | null = null) =>
    regras.find((r) => r.profissional_id === prof && r.tipo === tipo && r.categoria_id === cat)?.percentual;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Cartao className="text-sm text-suave">
        <p>
          <strong className="text-texto">Como funciona:</strong> vale sempre a regra mais específica — primeiro a do{" "}
          <strong className="text-texto">serviço</strong> (preenchida no cadastro de cada serviço), depois a da{" "}
          <strong className="text-texto">categoria</strong> e por último o <strong className="text-texto">padrão</strong> da profissional.
          Deixe em branco o que não se aplica. Quem não recebe comissão (ex.: o dono) não aparece aqui.
        </p>
      </Cartao>

      {salvo && (
        <p role="status" className="rounded-lg border border-sucesso/30 bg-[#E3EFE5] px-3 py-2 text-sm font-medium text-sucesso">
          Regras salvas.
        </p>
      )}

      {profissionais.length === 0 ? (
        <Vazio>Nenhuma profissional com comissão cadastrada. Cadastre em Equipe.</Vazio>
      ) : (
        <FormAcao acao={salvarRegras} className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {profissionais.map((p) => {
              const excecoes = regras.filter((r) => r.profissional_id === p.id && r.tipo === "servico");
              return (
                <Cartao key={p.id} className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">{p.nome}</h2>
                  <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                    Padrão (%)
                    <input name={`padrao__${p.id}`} inputMode="decimal" defaultValue={paraCampo(regra(p.id, "padrao"))}
                      placeholder="—" className={`${classeInput} w-24 text-center`} />
                  </label>
                  <div className="border-t border-borda pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Por categoria (%)</p>
                    <div className="flex flex-col gap-1">
                      {categorias.map((c) => (
                        <label key={c.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                          {c.nome}
                          <input name={`categoria__${p.id}__${c.id}`} inputMode="decimal" defaultValue={paraCampo(regra(p.id, "categoria", c.id))}
                            placeholder="—" className={`${classeInput} w-24 text-center`} />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-borda pt-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Exceções por serviço</p>
                    {excecoes.length === 0 ? (
                      <p className="text-suave">Nenhuma. Defina no cadastro de cada serviço.</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {excecoes.map((r) => (
                          <li key={r.id} className="flex justify-between gap-3">
                            <Link href={`/servicos?aba=servicos&editar=${r.servico_id}`} className="text-rose underline-offset-2 hover:underline">
                              {nomeServico.get(r.servico_id!) ?? "Serviço"}
                            </Link>
                            <span className="font-semibold">{formatarPercentual(Number(r.percentual))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Cartao>
              );
            })}
          </div>
          <div>
            <BotaoEnviar>Salvar regras</BotaoEnviar>
          </div>
        </FormAcao>
      )}

      <Cartao>
        <h2 className="mb-3 text-lg font-semibold">Últimas alterações</h2>
        {(log.data ?? []).length === 0 ? (
          <p className="text-sm text-suave">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {(log.data ?? []).map((l) => {
              const reg = (l.depois ?? l.antes) as RegraComissao;
              const alvo = reg.tipo === "padrao" ? "padrão"
                : reg.tipo === "categoria" ? `categoria ${categorias.find((c) => c.id === reg.categoria_id)?.nome ?? ""}`
                : `serviço ${nomeServico.get(reg.servico_id!) ?? ""}`;
              const de = l.antes ? formatarPercentual(Number(l.antes.percentual)) : "—";
              const para = l.depois ? formatarPercentual(Number(l.depois.percentual)) : "removida";
              return (
                <li key={l.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
                  <span>
                    {nomeProf.get(reg.profissional_id) ?? "?"}, {alvo}: <strong>{de} → {para}</strong>
                  </span>
                  <span className="text-xs text-suave">
                    {formatarDataHora(l.criado_em)} · {nomeUsuario.get(l.usuario_id) ?? "sistema"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
