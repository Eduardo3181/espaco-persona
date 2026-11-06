import { COR_COMISSAO, COR_SALAO } from "../relatorios/graficos";
import { formatarReais } from "@/lib/formato";

// Gráficos simples em HTML/SVG (sem biblioteca). Receitas #1BAF7A · despesas #B4583A
// (paleta validada para daltonismo; rótulos e tabela sempre disponíveis).

const COR_RECEITA = COR_SALAO;
const COR_DESPESA = COR_COMISSAO;

const reaisCurtos = (c: number) => (c / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Anel de progresso: quanto da meta ou do orçamento já foi usado. */
export function Anel({ percentual, cor, rotulo }: { percentual: number; cor: "receita" | "despesa"; rotulo: string }) {
  const r = 42;
  const volta = 2 * Math.PI * r;
  const preenchido = Math.min(Math.max(percentual, 0), 100) / 100 * volta;
  return (
    <div className="relative mx-auto size-36">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${rotulo}: ${percentual}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-borda)" strokeWidth="12" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={cor === "receita" ? COR_RECEITA : COR_DESPESA} strokeWidth="12"
          strokeDasharray={`${preenchido} ${volta}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">{percentual}%</span>
    </div>
  );
}

function VerEmTabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: { chave: string; celulas: string[] }[] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center text-rose">Ver em tabela</summary>
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead className="text-xs text-suave"><tr>{cabecalho.map((c, i) => <th key={c} className={`py-1 font-semibold ${i === 0 ? "text-left" : ""}`}>{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((l) => <tr key={l.chave}>{l.celulas.map((c, i) => <td key={i} className={`whitespace-nowrap py-1 ${i === 0 ? "text-left" : "pl-3"}`}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Dinheiro disponível mês a mês: uma linha, com o valor ao passar o dedo ou o mouse. */
export function LinhaSaldo({ pontos }: { pontos: { rotulo: string; valor: number | null }[] }) {
  const validos = pontos.map((p) => p.valor).filter((v): v is number => v !== null);
  if (validos.length === 0) return <p className="text-sm text-suave">Ainda não há meses para mostrar neste ano.</p>;
  const max = Math.max(...validos, 0);
  const min = Math.min(...validos, 0);
  const faixa = max - min || 1;
  const x = (i: number) => ((i + 0.5) / pontos.length) * 100;
  const y = (v: number) => 100 - ((v - min) / faixa) * 100;
  const linha = pontos.flatMap((p, i) => (p.valor === null ? [] : [`${x(i)},${y(p.valor)}`])).join(" ");
  return (
    <div>
      <div className="relative mx-1 my-6 h-36">
        {min < 0 && <div className="absolute inset-x-0 border-t border-dashed border-borda" style={{ top: `${y(0)}%` }} aria-hidden />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" role="img" aria-label="Dinheiro disponível mês a mês">
          <polyline points={linha} fill="none" stroke="var(--color-rose)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {pontos.map((p, i) => p.valor !== null && (
          <div key={p.rotulo} className="group absolute top-0 bottom-0" style={{ left: `${(i / pontos.length) * 100}%`, width: `${100 / pontos.length}%` }}>
            <span className="absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cartao bg-rose" style={{ top: `${y(p.valor)}%` }} />
            <span className="pointer-events-none absolute left-1/2 z-10 mb-2 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-escuro px-2 py-1 text-xs text-white group-hover:block" style={{ top: `${y(p.valor)}%` }}>
              {p.rotulo}: {formatarReais(p.valor)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex text-[11px] text-suave">
        {pontos.map((p) => <span key={p.rotulo} className="flex-1 text-center">{p.rotulo}</span>)}
      </div>
      <VerEmTabela cabecalho={["Mês", "Disponível"]} linhas={pontos.filter((p) => p.valor !== null).map((p) => ({ chave: p.rotulo, celulas: [p.rotulo, formatarReais(p.valor!)] }))} />
    </div>
  );
}

/** Receita x despesa de cada mês: duas barras finas, com legenda. */
export function BarrasMensais({ meses }: { meses: { rotulo: string; receita: number; despesa: number }[] }) {
  const max = Math.max(...meses.flatMap((m) => [m.receita, m.despesa]), 1);
  return (
    <div>
      <ul className="mb-2 flex gap-4 text-xs text-suave">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: COR_RECEITA }} aria-hidden /> Receitas</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: COR_DESPESA }} aria-hidden /> Despesas</li>
      </ul>
      <p className="text-xs text-suave">máx. {formatarReais(max)}</p>
      <div className="relative mt-1 flex h-44 items-end border-b border-borda" role="img" aria-label="Receitas e despesas por mês">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-borda/70" aria-hidden />
        {meses.map((m) => (
          <div key={m.rotulo} className="group relative flex h-full flex-1 items-end justify-center gap-[2px] px-[2px] hover:bg-fundo">
            <div className="max-w-3 flex-1 rounded-t" style={{ height: m.receita > 0 ? `${Math.max((m.receita / max) * 100, 1.5)}%` : 0, background: COR_RECEITA }} />
            <div className="max-w-3 flex-1 rounded-t" style={{ height: m.despesa > 0 ? `${Math.max((m.despesa / max) * 100, 1.5)}%` : 0, background: COR_DESPESA }} />
            <span className="pointer-events-none absolute top-0 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-escuro px-2 py-1 text-xs text-white group-hover:block">
              {m.rotulo}: {reaisCurtos(m.receita)} / {reaisCurtos(m.despesa)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex text-[11px] text-suave">
        {meses.map((m) => <span key={m.rotulo} className="flex-1 text-center">{m.rotulo}</span>)}
      </div>
      <VerEmTabela cabecalho={["Mês", "Receitas", "Despesas", "Sobrou"]} linhas={meses.map((m) => ({
        chave: m.rotulo, celulas: [m.rotulo, formatarReais(m.receita), formatarReais(m.despesa), formatarReais(m.receita - m.despesa)],
      }))} />
    </div>
  );
}
