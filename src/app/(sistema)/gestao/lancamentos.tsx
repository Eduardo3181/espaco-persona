import Link from "next/link";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Etiqueta, Vazio, classeBotao, classeInput } from "@/components/ui";
import { MESES, centavosParaCampo, formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";
import { GRUPOS, ehReceita, somarMeses, statusDe, type Categoria, type Conta, type Lancamento, type Status } from "@/lib/gestao";
import { buscarCadastros } from "./dados";
import { desfazerPago, excluirLancamento, marcarPago, salvarLancamento } from "./actions";

type Filtros = { mes: string; tipo: string; situacao: string; editar?: string };

const CAMPOS = "id, categoria_id, conta_id, descricao, valor_centavos, vencimento, pagamento, repeticao_id";

function SeloStatus({ status, receita }: { status: Status; receita: boolean }) {
  if (status === "pago") return <Etiqueta tom="sucesso">{receita ? "Recebido" : "Pago"}</Etiqueta>;
  if (status === "atrasado") return <Etiqueta tom="erro">Atrasado</Etiqueta>;
  return <Etiqueta tom="aviso">Aguardando</Etiqueta>;
}

export async function AbaLancamentos({ mes, tipo, situacao, editar }: Filtros) {
  const hoje = hojeISO();
  const supabase = await criarClienteServidor();
  const { categorias, contas } = await buscarCadastros(supabase);

  const verAtrasados = situacao === "atrasado";
  const consulta = supabase.from("fin_lancamentos").select(CAMPOS).order("vencimento");
  const { data } = verAtrasados
    ? await consulta.is("pagamento", null).lt("vencimento", hoje)
    : await consulta.gte("vencimento", `${mes}-01`).lt("vencimento", somarMeses(`${mes}-01`, 1));
  const categoriaDe = new Map(categorias.map((c) => [c.id, c]));
  const contaDe = new Map(contas.map((c) => [c.id, c.nome]));

  const lista = ((data ?? []) as Lancamento[]).filter((l) => {
    const c = categoriaDe.get(l.categoria_id);
    if (!c) return false;
    if (tipo === "receita" && !ehReceita(c.grupo)) return false;
    if (tipo === "despesa" && ehReceita(c.grupo)) return false;
    if (situacao === "pago" && !l.pagamento) return false;
    if (situacao === "aberto" && l.pagamento) return false;
    return true;
  });

  const { count: atrasados } = await supabase.from("fin_lancamentos").select("id", { count: "exact", head: true })
    .is("pagamento", null).lt("vencimento", hoje);

  const somaTipo = (receita: boolean) => lista.filter((l) => ehReceita(categoriaDe.get(l.categoria_id)!.grupo) === receita).reduce((s, l) => s + l.valor_centavos, 0);
  const consultaBase = `aba=lancamentos&mes=${mes}&tipo=${tipo}&situacao=${situacao}`;
  const volta = `/gestao?${consultaBase}`;
  const emEdicao = editar && editar !== "novo"
    ? (await supabase.from("fin_lancamentos").select(CAMPOS).eq("id", editar).maybeSingle()).data as Lancamento | null
    : null;
  const formAberto = editar === "novo" || Boolean(emEdicao);
  const [a, m] = mes.split("-").map(Number);

  return (
    <div className="flex flex-col gap-4">
      {!formAberto && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {verAtrasados ? (
            <h2 className="font-titulo text-3xl font-bold">Contas atrasadas</h2>
          ) : (
            <div className="flex items-center gap-2">
              <Link href={`/gestao?aba=lancamentos&mes=${somarMeses(`${mes}-01`, -1).slice(0, 7)}&tipo=${tipo}&situacao=${situacao}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Mês anterior"><ChevronLeft size={20} /></Link>
              <h2 className="font-titulo text-3xl font-bold first-letter:uppercase">{MESES[m - 1]} de {a}</h2>
              <Link href={`/gestao?aba=lancamentos&mes=${somarMeses(`${mes}-01`, 1).slice(0, 7)}&tipo=${tipo}&situacao=${situacao}`} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Próximo mês"><ChevronRight size={20} /></Link>
            </div>
          )}
          <BotaoLink href={`${volta}&editar=novo`}><Plus size={18} aria-hidden /> Novo lançamento</BotaoLink>
        </div>
      )}

      {formAberto && (
        <FormLancamento chave={editar!} categorias={categorias} contas={contas} emEdicao={emEdicao} volta={volta} hoje={hoje} />
      )}

      {!verAtrasados && (atrasados ?? 0) > 0 && (
        <p className="rounded-lg border border-erro/30 bg-[#F6E3E3] px-3 py-2 text-sm text-erro">
          {atrasados === 1 ? "Há 1 conta atrasada." : `Há ${atrasados} contas atrasadas.`}{" "}
          <Link href={`/gestao?aba=lancamentos&mes=${mes}&situacao=atrasado`} className="font-semibold underline">Ver</Link>
        </p>
      )}

      <form action="/gestao" method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="lancamentos" />
        <input type="hidden" name="mes" value={mes} />
        <select name="tipo" defaultValue={tipo} aria-label="Tipo" className={classeInput.replace("w-full ", "")}>
          <option value="todos">Pagar e receber</option>
          <option value="despesa">Só a pagar</option>
          <option value="receita">Só a receber</option>
        </select>
        <select name="situacao" defaultValue={situacao} aria-label="Situação" className={classeInput.replace("w-full ", "")}>
          <option value="todos">Todas as situações</option>
          <option value="aberto">Em aberto</option>
          <option value="pago">Pagas ou recebidas</option>
          <option value="atrasado">Atrasadas (todos os meses)</option>
        </select>
        <button className={classeBotao("secundario")}>Filtrar</button>
      </form>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>A receber e recebido: <strong className="text-sucesso">{formatarReais(somaTipo(true))}</strong></span>
        <span>A pagar e pago: <strong className="text-erro">{formatarReais(somaTipo(false))}</strong></span>
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhum lançamento aqui.</Vazio>
      ) : (
        <ul className="divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-cartao">
          {lista.map((l) => {
            const c = categoriaDe.get(l.categoria_id)!;
            const receita = ehReceita(c.grupo);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{l.descricao || c.nome}</p>
                  <p className="text-xs text-suave">
                    {l.descricao && `${c.nome} · `}{l.conta_id ? `${contaDe.get(l.conta_id)} · ` : ""}vence {formatarDiaISO(l.vencimento)}
                    {l.pagamento && ` · ${receita ? "recebido" : "pago"} ${formatarDiaISO(l.pagamento)}`}
                    {l.repeticao_id && " · repete"}
                  </p>
                </div>
                <span className={`font-semibold ${receita ? "text-sucesso" : ""}`}>{receita ? "+ " : "− "}{formatarReais(l.valor_centavos)}</span>
                <SeloStatus status={statusDe(l, hoje)} receita={receita} />
                <div className="flex items-center gap-1">
                  {l.pagamento ? (
                    <FormAcao acao={desfazerPago}>
                      <input type="hidden" name="id" value={l.id} /><input type="hidden" name="volta" value={volta} />
                      <BotaoEnviar variante="fantasma" pendente="…" className="px-2" confirmar="Voltar esta conta para em aberto?">
                        <Undo2 size={18} aria-label="Desfazer pagamento" />
                      </BotaoEnviar>
                    </FormAcao>
                  ) : (
                    <FormAcao acao={marcarPago}>
                      <input type="hidden" name="id" value={l.id} /><input type="hidden" name="volta" value={volta} />
                      <BotaoEnviar variante="secundario" pendente="…">{receita ? "Recebi" : "Paguei"}</BotaoEnviar>
                    </FormAcao>
                  )}
                  <BotaoLink href={`${volta}&editar=${l.id}`} variante="fantasma" className="px-2" aria-label="Editar lançamento"><Pencil size={18} /></BotaoLink>
                  <FormAcao acao={excluirLancamento}>
                    <input type="hidden" name="id" value={l.id} /><input type="hidden" name="volta" value={volta} />
                    <input type="hidden" name="repeticao_id" value={l.pagamento ? "" : l.repeticao_id ?? ""} />
                    <input type="hidden" name="vencimento" value={l.vencimento} />
                    <BotaoEnviar variante="fantasma" pendente="…" className="px-2"
                      confirmar={l.repeticao_id && !l.pagamento ? "Excluir esta conta e as próximas repetições em aberto?" : "Excluir este lançamento?"}>
                      <Trash2 size={18} aria-label="Excluir lançamento" />
                    </BotaoEnviar>
                  </FormAcao>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-suave">Vendas, taxas da maquininha e comissões entram sozinhas no Painel, vindas das comandas. Aqui ficam só as outras contas.</p>
    </div>
  );
}

function FormLancamento({ chave, categorias, contas, emEdicao, volta, hoje }: {
  chave: string; categorias: Categoria[]; contas: Conta[]; emEdicao: Lancamento | null; volta: string; hoje: string;
}) {
  const ativasOuAtual = (c: { id: string; ativo: boolean }, atual?: string | null) => c.ativo || c.id === atual;
  return (
    <Cartao>
      <h2 className="mb-4 text-lg font-semibold">{emEdicao ? "Editar lançamento" : "Novo lançamento"}</h2>
      <FormAcao key={chave} acao={salvarLancamento} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={emEdicao?.id ?? ""} />
        <input type="hidden" name="volta" value={volta} />
        <Campo rotulo="Categoria">
          <select name="categoria_id" required defaultValue={emEdicao?.categoria_id ?? ""} className={classeInput}>
            <option value="" disabled>Escolha…</option>
            {GRUPOS.map((g) => (
              <optgroup key={g.id} label={g.rotulo}>
                {categorias.filter((c) => c.grupo === g.id && ativasOuAtual(c, emEdicao?.categoria_id)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Descrição (opcional)">
          <input name="descricao" defaultValue={emEdicao?.descricao ?? ""} placeholder="Ex.: conta de novembro" className={classeInput} />
        </Campo>
        <Campo rotulo="Valor (R$)">
          <input name="valor" inputMode="decimal" required placeholder="0,00" defaultValue={emEdicao ? centavosParaCampo(emEdicao.valor_centavos) : ""} className={classeInput} />
        </Campo>
        <Campo rotulo="Conta (opcional)">
          <select name="conta_id" defaultValue={emEdicao?.conta_id ?? ""} className={classeInput}>
            <option value="">Não informar</option>
            {contas.filter((c) => ativasOuAtual(c, emEdicao?.conta_id)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vencimento">
          <input name="vencimento" type="date" required defaultValue={emEdicao?.vencimento ?? hoje} className={classeInput} />
        </Campo>
        <Campo rotulo="Pago ou recebido em" dica="Deixe vazio se ainda está em aberto.">
          <input name="pagamento" type="date" max={hoje} defaultValue={emEdicao?.pagamento ?? ""} className={classeInput} />
        </Campo>
        {!emEdicao && (
          <Campo rotulo="Repetir">
            <select name="repetir" defaultValue="1" className={classeInput}>
              <option value="1">Não repetir</option>
              {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Todo mês, por {n} meses</option>)}
            </select>
          </Campo>
        )}
        <div className="flex gap-3 sm:col-span-2">
          <BotaoEnviar>Salvar</BotaoEnviar>
          <BotaoLink href={volta} variante="secundario">Cancelar</BotaoLink>
        </div>
      </FormAcao>
    </Cartao>
  );
}
