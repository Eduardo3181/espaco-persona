import { Pencil, Plus } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Etiqueta, classeInput } from "@/components/ui";
import { centavosParaCampo, formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";
import { GRUPOS } from "@/lib/gestao";
import { buscarCadastros, buscarPosicao } from "./dados";
import { salvarCategoria, salvarConta, salvarInicio } from "./actions";

function CaixaAtivo({ ativo }: { ativo?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
      <input type="checkbox" name="ativo" defaultChecked={ativo ?? true} className="size-5 accent-rose" />
      Ativa (aparece para uso)
    </label>
  );
}

export async function AbaPlano({ editar }: { editar?: string }) {
  const supabase = await criarClienteServidor();
  const [{ categorias, contas }, posicao] = await Promise.all([buscarCadastros(supabase), buscarPosicao(supabase, hojeISO())]);
  const categoria = categorias.find((c) => `cat-${c.id}` === editar);
  const conta = contas.find((c) => `conta-${c.id}` === editar);
  const novaCategoria = editar === "cat-nova" || Boolean(categoria);
  const novaConta = editar === "conta-nova" || Boolean(conta);
  const totalInicial = contas.filter((c) => c.ativo).reduce((s, c) => s + c.saldo_inicial_centavos, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Ponto de partida do dinheiro disponível */}
      <Cartao className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Contas e ponto de partida</h2>
          <p className="text-sm text-suave">
            Informe quanto havia em cada conta no dia em que começou a usar a Gestão. A partir dessa data, o sistema soma o que entra e desconta o que sai.
          </p>
        </div>

        <FormAcao acao={salvarInicio} className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Data de início do controle">
            <input name="inicio" type="date" required defaultValue={posicao.inicio ?? hojeISO()} className={classeInput} />
          </Campo>
          <BotaoEnviar variante="secundario">Salvar data</BotaoEnviar>
          <p className="min-h-11 content-center text-sm">
            {posicao.inicio
              ? <>Contando desde <strong>{formatarDiaISO(posicao.inicio)}</strong>, com saldo inicial de <strong>{formatarReais(totalInicial)}</strong>.</>
              : <span className="font-semibold text-aguardando">Falta salvar a data de início.</span>}
          </p>
        </FormAcao>

        <ul className="divide-y divide-borda rounded-lg border border-borda">
          {contas.map((c) => (
            <li key={c.id} className={`flex items-center gap-3 px-3 py-1 ${c.ativo ? "" : "opacity-60"}`}>
              <span className="min-w-0 flex-1 font-medium">{c.nome} {!c.ativo && <Etiqueta tom="erro">Inativa</Etiqueta>}</span>
              <span className={c.saldo_inicial_centavos < 0 ? "text-erro" : ""}>{formatarReais(c.saldo_inicial_centavos)}</span>
              <BotaoLink href={`/gestao?aba=plano&editar=conta-${c.id}`} variante="fantasma" className="px-2" aria-label={`Editar ${c.nome}`}><Pencil size={18} /></BotaoLink>
            </li>
          ))}
        </ul>

        {novaConta ? (
          <FormAcao key={editar} acao={salvarConta} className="grid gap-4 rounded-lg border border-dashed border-borda p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={conta?.id ?? ""} />
            <Campo rotulo="Nome da conta">
              <input name="nome" required defaultValue={conta?.nome} placeholder="Ex.: Banco, Maquininha" className={classeInput} />
            </Campo>
            <Campo rotulo="Saldo no início (R$)" dica="Se estiver negativo, use o sinal de menos: -300,00">
              <input name="saldo" inputMode="decimal" defaultValue={conta ? centavosParaCampo(conta.saldo_inicial_centavos) : ""} placeholder="0,00" className={classeInput} />
            </Campo>
            <CaixaAtivo ativo={conta?.ativo} />
            <div className="flex gap-3 sm:col-span-2">
              <BotaoEnviar>Salvar</BotaoEnviar>
              <BotaoLink href="/gestao?aba=plano" variante="secundario">Cancelar</BotaoLink>
            </div>
          </FormAcao>
        ) : (
          <BotaoLink href="/gestao?aba=plano&editar=conta-nova" variante="secundario" className="self-start"><Plus size={18} aria-hidden /> Nova conta</BotaoLink>
        )}
        <p className="text-xs text-suave">O dinheiro disponível é o total de todas as contas. As vendas das comandas não são separadas por conta.</p>
      </Cartao>

      {/* Plano de contas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Categorias</h2>
        {!novaCategoria && <BotaoLink href="/gestao?aba=plano&editar=cat-nova"><Plus size={18} aria-hidden /> Nova categoria</BotaoLink>}
      </div>

      {novaCategoria && (
        <Cartao>
          <FormAcao key={editar} acao={salvarCategoria} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={categoria?.id ?? ""} />
            <Campo rotulo="Nome da categoria">
              <input name="nome" required defaultValue={categoria?.nome} className={classeInput} />
            </Campo>
            <Campo rotulo="Grupo">
              <select name="grupo" required defaultValue={categoria?.grupo ?? ""} className={classeInput}>
                <option value="" disabled>Escolha…</option>
                {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.rotulo}</option>)}
              </select>
            </Campo>
            <CaixaAtivo ativo={categoria?.ativo} />
            <div className="flex gap-3 sm:col-span-2">
              <BotaoEnviar>Salvar</BotaoEnviar>
              <BotaoLink href="/gestao?aba=plano" variante="secundario">Cancelar</BotaoLink>
            </div>
          </FormAcao>
        </Cartao>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {GRUPOS.map((g) => (
          <section key={g.id} className="overflow-hidden rounded-xl border border-borda bg-cartao">
            <div className="border-b border-borda bg-fundo/60 px-4 py-2">
              <h3 className="text-sm font-semibold text-rose">{g.rotulo}</h3>
              <p className="text-xs text-suave">{g.dica}</p>
            </div>
            <ul className="divide-y divide-borda">
              {g.id === "receita" && <li className="px-4 py-3 text-sm text-suave">Vendas das comandas (automático)</li>}
              {g.id === "custo_variavel" && <li className="px-4 py-3 text-sm text-suave">Comissões e taxas da maquininha (automático)</li>}
              {categorias.filter((c) => c.grupo === g.id).map((c) => (
                <li key={c.id} className={`flex items-center gap-3 px-4 py-1 ${c.ativo ? "" : "opacity-60"}`}>
                  <span className="min-w-0 flex-1 text-sm">{c.nome} {!c.ativo && <Etiqueta tom="erro">Inativa</Etiqueta>}</span>
                  <BotaoLink href={`/gestao?aba=plano&editar=cat-${c.id}`} variante="fantasma" className="px-2" aria-label={`Editar ${c.nome}`}><Pencil size={18} /></BotaoLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
