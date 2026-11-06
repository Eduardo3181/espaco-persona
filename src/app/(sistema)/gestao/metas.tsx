import Link from "next/link";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, Cartao, Vazio, classeInput } from "@/components/ui";
import { centavosParaCampo, formatarPercentual, formatarReais, hojeISO } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";
import { calcularResultado, contasDaMeta, porcentagem, type Meta } from "@/lib/gestao";
import { buscarAutomaticos, buscarCadastros, buscarLancamentosDoPeriodo } from "./dados";
import { salvarMeta } from "./actions";

export async function AbaMetas({ editar }: { editar?: string }) {
  const hoje = hojeISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const supabase = await criarClienteServidor();
  const [{ data }, { categorias }] = await Promise.all([
    supabase.from("fin_metas").select("*").order("ano", { ascending: false }),
    buscarCadastros(supabase),
  ]);
  const metas = (data ?? []) as Meta[];
  const emEdicao = metas.find((m) => String(m.ano) === editar);

  const realizado = await Promise.all(metas.map(async (m) => {
    const [lancamentos, automaticos] = await Promise.all([
      buscarLancamentosDoPeriodo(supabase, `${m.ano}-01-01`, `${m.ano}-12-31`),
      buscarAutomaticos(supabase, `${m.ano}-01-01`, `${m.ano}-12-31`),
    ]);
    const doAno = lancamentos.filter((l) => l.vencimento.startsWith(String(m.ano)) && (l.vencimento <= hoje || l.pagamento));
    return { ano: m.ano, r: calcularResultado(doAno, automaticos, categorias) };
  }));

  return (
    <div className="flex flex-col gap-5">
      <Cartao>
        <h2 className="mb-1 text-lg font-semibold">{emEdicao ? `Meta de ${emEdicao.ano}` : "Definir meta do ano"}</h2>
        <p className="mb-4 text-sm text-suave">Com a meta e o lucro desejado, o sistema calcula quanto o salão pode gastar no ano (o orçamento).</p>
        <FormAcao key={editar ?? "nova"} acao={salvarMeta} className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-start">
          <Campo rotulo="Ano">
            <input name="ano" type="number" min={2000} max={2100} required defaultValue={emEdicao?.ano ?? anoAtual} className={classeInput} />
          </Campo>
          <Campo rotulo="Meta de vendas no ano (R$)">
            <input name="meta" inputMode="decimal" required placeholder="0,00" defaultValue={emEdicao ? centavosParaCampo(emEdicao.meta_vendas_centavos) : ""} className={classeInput} />
          </Campo>
          <Campo rotulo="Lucro desejado (%)">
            <input name="lucro" inputMode="decimal" required placeholder="15" defaultValue={emEdicao ? String(emEdicao.lucro_desejado_percentual).replace(".", ",") : ""} className={classeInput} />
          </Campo>
          <BotaoEnviar className="sm:mt-6">Salvar</BotaoEnviar>
        </FormAcao>
      </Cartao>

      {metas.length === 0 ? <Vazio>Nenhuma meta definida ainda.</Vazio> : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-cartao">
          <table className="w-full min-w-[44rem] text-right text-sm">
            <thead className="bg-escuro text-xs text-sobre-escuro">
              <tr>{["Ano", "Meta de vendas", "Lucro desejado", "Lucro esperado", "Orçamento", "Vendido até agora", ""].map((c, i) => <th key={c || i} className={`px-3 py-2 font-semibold ${i === 0 ? "text-left" : ""}`}>{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {metas.map((m) => {
                const { lucroEsperado, orcamento } = contasDaMeta(m);
                const r = realizado.find((x) => x.ano === m.ano)!.r;
                return (
                  <tr key={m.id}>
                    <th scope="row" className="px-3 py-2 text-left font-semibold">{m.ano}</th>
                    <td className="px-3 py-2">{formatarReais(m.meta_vendas_centavos)}</td>
                    <td className="px-3 py-2">{formatarPercentual(Number(m.lucro_desejado_percentual))}</td>
                    <td className="px-3 py-2">{formatarReais(lucroEsperado)}</td>
                    <td className="px-3 py-2">{formatarReais(orcamento)}</td>
                    <td className="px-3 py-2">{formatarReais(r.receita)} <span className="text-xs text-suave">({porcentagem(r.receita, m.meta_vendas_centavos)}%)</span></td>
                    <td className="px-3 py-2"><Link href={`/gestao?aba=metas&editar=${m.ano}`} className="inline-flex min-h-11 items-center font-semibold text-rose">Editar</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
