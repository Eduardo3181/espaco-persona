import { Cartao, classeBotao, classeInput } from "@/components/ui";
import { formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import { dataValida, somarDias } from "@/lib/agenda";
import { criarClienteServidor } from "@/lib/supabase/server";
import { calcularResultado, maioresDespesas, somarMeses, type Categoria } from "@/lib/gestao";
import { buscarAutomaticos, buscarCadastros, buscarLancamentosDoPeriodo } from "./dados";
import { linhasResultado } from "./painel";

type Periodos = { de1?: string; ate1?: string; de2?: string; ate2?: string };

function Comparacao({ a, b }: { a: number; b: number }) {
  if (b === 0) return <span className="text-suave">–</span>;
  const pct = Math.round(((a - b) / Math.abs(b)) * 100);
  return <span>{pct > 0 ? "+" : ""}{pct}%</span>;
}

async function dadosDoPeriodo(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, categorias: Categoria[], de: string, ate: string) {
  const [lancamentos, automaticos] = await Promise.all([buscarLancamentosDoPeriodo(supabase, de, ate), buscarAutomaticos(supabase, de, ate)]);
  const doPeriodo = lancamentos.filter((l) => l.vencimento >= de && l.vencimento <= ate);
  return { r: calcularResultado(doPeriodo, automaticos, categorias), top: maioresDespesas(doPeriodo, automaticos, categorias, 8) };
}

export async function AbaAnalise(p: Periodos) {
  // Padrão: este mês contra o mês passado
  const hoje = hojeISO();
  const comecoMes = `${hoje.slice(0, 7)}-01`;
  const mesPassado = somarMeses(comecoMes, -1);
  const de1 = dataValida(p.de1) ? p.de1 : comecoMes;
  const ate1 = dataValida(p.ate1) && p.ate1 >= de1 ? p.ate1 : somarDias(somarMeses(comecoMes, 1), -1);
  const de2 = dataValida(p.de2) ? p.de2 : mesPassado;
  const ate2 = dataValida(p.ate2) && p.ate2 >= de2 ? p.ate2 : somarDias(comecoMes, -1);

  const supabase = await criarClienteServidor();
  const { categorias } = await buscarCadastros(supabase);
  const [A, B] = await Promise.all([dadosDoPeriodo(supabase, categorias, de1, ate1), dadosDoPeriodo(supabase, categorias, de2, ate2)]);
  const linhasB = linhasResultado(B.r);
  const nomesTop = [...new Set([...A.top, ...B.top].map((t) => t.nome))];
  const valorTop = (lista: typeof A.top, nome: string) => lista.find((t) => t.nome === nome)?.valor ?? 0;
  const tituloA = `${formatarDiaISO(de1)} a ${formatarDiaISO(ate1)}`;
  const tituloB = `${formatarDiaISO(de2)} a ${formatarDiaISO(ate2)}`;

  return (
    <div className="flex flex-col gap-5">
      <form action="/gestao" method="get" className="grid gap-3 rounded-xl border border-borda bg-cartao p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <input type="hidden" name="aba" value="analise" />
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm font-medium">Período</legend>
          <input type="date" name="de1" defaultValue={de1} aria-label="Período: de" className={classeInput} />
          <input type="date" name="ate1" defaultValue={ate1} aria-label="Período: até" className={classeInput} />
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm font-medium">Comparar com</legend>
          <input type="date" name="de2" defaultValue={de2} aria-label="Comparar com: de" className={classeInput} />
          <input type="date" name="ate2" defaultValue={ate2} aria-label="Comparar com: até" className={classeInput} />
        </fieldset>
        <button className={classeBotao("primario")}>Comparar</button>
      </form>

      <Cartao className="overflow-x-auto">
        <h3 className="mb-2 font-semibold">Resultado</h3>
        <table className="w-full min-w-[32rem] text-right text-sm">
          <thead className="text-xs text-suave">
            <tr><th className="py-1 text-left font-semibold">&nbsp;</th><th className="px-2 py-1 font-semibold">{tituloA}</th><th className="px-2 py-1 font-semibold">{tituloB}</th><th className="py-1 pl-2 font-semibold">Variação</th></tr>
          </thead>
          <tbody>
            {linhasResultado(A.r).map((l, i) => (
              <tr key={l.rotulo} className={l.total ? "border-t border-borda font-semibold" : ""}>
                <th scope="row" className="py-1.5 text-left font-[inherit]">{l.rotulo}</th>
                <td className={`px-2 py-1.5 ${l.valor < 0 ? "text-erro" : ""}`}>{formatarReais(l.valor)}</td>
                <td className={`px-2 py-1.5 ${linhasB[i].valor < 0 ? "text-erro" : ""}`}>{formatarReais(linhasB[i].valor)}</td>
                <td className="py-1.5 pl-2"><Comparacao a={l.valor} b={linhasB[i].valor} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      <Cartao className="overflow-x-auto">
        <h3 className="mb-2 font-semibold">Maiores despesas</h3>
        {nomesTop.length === 0 ? <p className="text-sm text-suave">Nenhuma despesa nesses períodos.</p> : (
          <table className="w-full min-w-[32rem] text-right text-sm">
            <thead className="text-xs text-suave">
              <tr><th className="py-1 text-left font-semibold">&nbsp;</th><th className="px-2 py-1 font-semibold">{tituloA}</th><th className="px-2 py-1 font-semibold">{tituloB}</th><th className="py-1 pl-2 font-semibold">Variação</th></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {nomesTop.map((nome) => (
                <tr key={nome}>
                  <th scope="row" className="py-1.5 text-left font-normal">{nome}</th>
                  <td className="px-2 py-1.5">{formatarReais(valorTop(A.top, nome))}</td>
                  <td className="px-2 py-1.5">{formatarReais(valorTop(B.top, nome))}</td>
                  <td className="py-1.5 pl-2"><Comparacao a={valorTop(A.top, nome)} b={valorTop(B.top, nome)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </div>
  );
}
