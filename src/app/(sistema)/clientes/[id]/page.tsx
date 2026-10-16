import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cake, CalendarHeart, MessageCircle, Pencil, Phone, Trash2 } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Vazio, classeInput } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  formatarAniversario, formatarDataHora, formatarDiaISO, formatarReais, formatarTelefone, linkWhatsApp,
} from "@/lib/formato";
import { apagarAnotacao, apagarMovimento, criarAnotacao, editarAnotacao, lancarSaldo, salvarFicha } from "../actions";

export const metadata: Metadata = { title: "Ficha da cliente" };

type Anotacao = { id: string; autor_id: string | null; texto: string; criado_em: string; editado_em: string | null };
type Movimento = { id: string; valor_centavos: number; descricao: string; criado_em: string };

const classeTexto = `${classeInput} min-h-24 py-2`;

export default async function FichaCliente({ params, searchParams }: PageProps<"/clientes/[id]">) {
  const { profissional } = await exigirEquipe();
  const ehDono = profissional.papel === "dono";
  const { id } = await params;
  const sp = await searchParams;
  const editarAnotacaoId = typeof sp.anotacao === "string" ? sp.anotacao : undefined;

  const supabase = await criarClienteServidor();
  const [{ data: cliente }, { data: ficha }, { data: anotacoesData }, { data: equipe }, saldoRes] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
    supabase.from("fichas_tecnicas").select("*").eq("cliente_id", id).maybeSingle(),
    supabase.from("anotacoes_clientes").select("id, autor_id, texto, criado_em, editado_em").eq("cliente_id", id).order("criado_em", { ascending: false }),
    supabase.from("profissionais").select("id, nome"),
    ehDono
      ? supabase.from("movimentos_saldo").select("id, valor_centavos, descricao, criado_em").eq("cliente_id", id).order("criado_em", { ascending: false })
      : Promise.resolve({ data: [] as Movimento[] }),
  ]);
  if (!cliente) notFound();

  const anotacoes = (anotacoesData ?? []) as Anotacao[];
  const movimentos = (saldoRes.data ?? []) as Movimento[];
  const saldo = movimentos.reduce((s, m) => s + m.valor_centavos, 0);
  const nomeDe = new Map((equipe ?? []).map((p) => [p.id, p.nome]));
  const aniversario = formatarAniversario(cliente.aniversario_dia, cliente.aniversario_mes, cliente.aniversario_ano);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link href="/clientes" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-rose">
        <ArrowLeft size={18} aria-hidden /> Todas as clientes
      </Link>

      {/* Cabeçalho */}
      <Cartao className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-agendado-fundo font-titulo text-3xl font-bold text-rose" aria-hidden>
          {cliente.nome.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-titulo text-3xl font-bold">{cliente.nome}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-suave sm:flex-row sm:flex-wrap sm:gap-x-5">
            {cliente.telefone && <li className="flex items-center gap-2"><Phone size={15} aria-hidden /> {formatarTelefone(cliente.telefone)}</li>}
            {aniversario && <li className="flex items-center gap-2"><Cake size={15} aria-hidden /> {aniversario}</li>}
            <li className="flex items-center gap-2"><CalendarHeart size={15} aria-hidden /> Cliente desde {formatarDiaISO(cliente.cliente_desde)}</li>
          </ul>
        </div>
        <div className="flex gap-2">
          {cliente.telefone && (
            <a href={linkWhatsApp(cliente.telefone)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sucesso px-4 text-sm font-semibold text-white hover:opacity-90">
              <MessageCircle size={18} aria-hidden /> WhatsApp
            </a>
          )}
          <BotaoLink href={`/clientes/${cliente.id}/editar`} variante="secundario">
            <Pencil size={16} aria-hidden /> Editar
          </BotaoLink>
        </div>
      </Cartao>

      {/* Resumo */}
      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Última visita" valor="—" />
        <Indicador rotulo="Visitas" valor="0" />
        <Indicador rotulo="Frequência média" valor="—" />
        <Indicador rotulo="Serviço mais feito" valor="—" />
        {ehDono && <Indicador rotulo="Total gasto" valor={formatarReais(0)} />}
        {ehDono && (
          <Indicador
            rotulo="Saldo na casa"
            valor={saldo === 0 ? formatarReais(0) : `${saldo > 0 ? "Crédito" : "Deve"} ${formatarReais(Math.abs(saldo))}`}
            tom={saldo > 0 ? "text-sucesso" : saldo < 0 ? "text-erro" : undefined}
          />
        )}
      </section>
      <p className="-mt-3 text-xs text-suave">Visitas, frequência e total gasto passam a ser calculados quando as comandas entrarem no sistema (fase 4).</p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ficha técnica */}
        <Cartao>
          <h2 className="mb-1 text-lg font-semibold">Ficha técnica</h2>
          <p className="mb-4 text-xs text-suave">
            {ficha?.atualizado_em
              ? `Atualizada em ${formatarDataHora(ficha.atualizado_em)}${ficha.atualizado_por ? ` por ${nomeDe.get(ficha.atualizado_por) ?? "—"}` : ""}`
              : "Ainda não preenchida."}
            {sp.salvo === "ficha" && <span className="ml-2 font-semibold text-sucesso">Salva!</span>}
          </p>
          <FormAcao acao={salvarFicha} className="flex flex-col gap-4">
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <Campo rotulo="Cor / fórmula da coloração">
              <textarea name="cor_formula" defaultValue={ficha?.cor_formula ?? ""} className={classeTexto} />
            </Campo>
            <Campo rotulo="Tipo de cabelo">
              <input name="tipo_cabelo" defaultValue={ficha?.tipo_cabelo ?? ""} className={classeInput} />
            </Campo>
            <Campo rotulo="Alergias e cuidados">
              <textarea name="alergias_cuidados" defaultValue={ficha?.alergias_cuidados ?? ""}
                className={`${classeTexto} ${ficha?.alergias_cuidados ? "border-aguardando bg-aguardando-fundo/40" : ""}`} />
            </Campo>
            <Campo rotulo="Preferências">
              <textarea name="preferencias" defaultValue={ficha?.preferencias ?? ""} className={classeTexto} />
            </Campo>
            <div><BotaoEnviar>Salvar ficha técnica</BotaoEnviar></div>
          </FormAcao>
        </Cartao>

        {/* Anotações */}
        <Cartao>
          <h2 id="anotacoes" className="mb-4 scroll-mt-4 text-lg font-semibold">Anotações</h2>
          <FormAcao acao={criarAnotacao} className="mb-5 flex flex-col gap-3">
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <label className="sr-only" htmlFor="nova-anotacao">Nova anotação</label>
            <textarea id="nova-anotacao" name="texto" required placeholder="Escreva uma anotação…" className={classeTexto} />
            <div><BotaoEnviar>Salvar anotação</BotaoEnviar></div>
          </FormAcao>

          {anotacoes.length === 0 ? (
            <Vazio>Nenhuma anotação ainda.</Vazio>
          ) : (
            <ol className="flex flex-col gap-3">
              {anotacoes.map((a) => {
                const minha = a.autor_id === profissional.id;
                const podeApagar = minha || ehDono;
                return (
                  <li key={a.id} className="rounded-lg border border-borda bg-fundo/50 p-3">
                    <p className="mb-1 text-xs text-suave">
                      <strong className="text-texto">{a.autor_id ? nomeDe.get(a.autor_id) ?? "—" : "—"}</strong>
                      {" · "}{formatarDataHora(a.criado_em)}
                      {a.editado_em && " · editada"}
                    </p>
                    {editarAnotacaoId === a.id && minha ? (
                      <FormAcao acao={editarAnotacao} className="flex flex-col gap-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="cliente_id" value={cliente.id} />
                        <textarea name="texto" required defaultValue={a.texto} aria-label="Corrigir anotação" className={classeTexto} />
                        <div className="flex gap-2">
                          <BotaoEnviar>Salvar</BotaoEnviar>
                          <BotaoLink href={`/clientes/${cliente.id}#anotacoes`} variante="secundario">Cancelar</BotaoLink>
                        </div>
                      </FormAcao>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{a.texto}</p>
                    )}
                    {editarAnotacaoId !== a.id && (minha || podeApagar) && (
                      <div className="mt-1 flex gap-1">
                        {minha && (
                          <BotaoLink href={`/clientes/${cliente.id}?anotacao=${a.id}#anotacoes`} variante="fantasma" className="min-h-9 px-2 text-xs">
                            <Pencil size={14} aria-hidden /> Corrigir
                          </BotaoLink>
                        )}
                        {podeApagar && (
                          <FormAcao acao={apagarAnotacao}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="cliente_id" value={cliente.id} />
                            <BotaoEnviar variante="fantasma" pendente="Apagando…" className="min-h-9 px-2 text-xs" confirmar="Apagar esta anotação?">
                              <Trash2 size={14} aria-hidden /> Apagar
                            </BotaoEnviar>
                          </FormAcao>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Cartao>
      </div>

      {/* Saldo na casa (só dono) */}
      {ehDono && (
        <Cartao>
          <h2 id="saldo" className="mb-1 scroll-mt-4 text-lg font-semibold">Saldo na casa</h2>
          <p className={`mb-4 text-2xl font-bold ${saldo > 0 ? "text-sucesso" : saldo < 0 ? "text-erro" : ""}`}>
            {saldo === 0 ? formatarReais(0) : `${saldo > 0 ? "Crédito de" : "Deve"} ${formatarReais(Math.abs(saldo))}`}
          </p>
          <FormAcao acao={lancarSaldo} className="mb-5 grid gap-3 sm:grid-cols-[10rem_9rem_1fr_auto] sm:items-end">
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <Campo rotulo="Tipo">
              <select name="tipo" defaultValue="credito" className={classeInput}>
                <option value="credito">Crédito (+)</option>
                <option value="debito">Débito (−)</option>
              </select>
            </Campo>
            <Campo rotulo="Valor (R$)">
              <input name="valor" inputMode="decimal" required placeholder="0,00" className={classeInput} />
            </Campo>
            <Campo rotulo="Motivo">
              <input name="descricao" required placeholder="Ex.: pagou adiantado" className={classeInput} />
            </Campo>
            <BotaoEnviar>Lançar</BotaoEnviar>
          </FormAcao>
          {movimentos.length === 0 ? (
            <p className="text-sm text-suave">Nenhum lançamento.</p>
          ) : (
            <ul className="divide-y divide-borda text-sm">
              {movimentos.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">
                    {m.descricao}
                    <span className="block text-xs text-suave">{formatarDataHora(m.criado_em)}</span>
                  </span>
                  <span className={`font-semibold ${m.valor_centavos > 0 ? "text-sucesso" : "text-erro"}`}>
                    {m.valor_centavos > 0 ? "+" : "−"} {formatarReais(Math.abs(m.valor_centavos))}
                  </span>
                  <FormAcao acao={apagarMovimento}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="cliente_id" value={cliente.id} />
                    <BotaoEnviar variante="fantasma" pendente="…" className="px-2" confirmar="Apagar este lançamento do saldo?">
                      <Trash2 size={16} aria-label="Apagar lançamento" />
                    </BotaoEnviar>
                  </FormAcao>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {/* Histórico */}
      <Cartao>
        <h2 className="mb-3 text-lg font-semibold">Histórico de atendimentos</h2>
        <Vazio>O histórico aparece aqui quando as comandas forem fechadas no sistema (fase 4).</Vazio>
      </Cartao>
    </div>
  );
}

function Indicador({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="rounded-xl border border-borda bg-cartao p-3">
      <p className="text-xs text-suave">{rotulo}</p>
      <p className={`mt-1 font-semibold ${tom ?? ""}`}>{valor}</p>
    </div>
  );
}
