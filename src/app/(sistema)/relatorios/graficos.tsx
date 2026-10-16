import { formatarReais } from "@/lib/formato";

// Gráficos simples em HTML (sem biblioteca). Paleta validada para daltonismo:
// comissões #B4583A · taxas #6250D6 · fica no salão #1BAF7A (com rótulos sempre visíveis).

export const COR_COMISSAO = "#B4583A";
export const COR_TAXA = "#6250D6";
export const COR_SALAO = "#1BAF7A";
export const COR_BARRA = "#B4583A";

/** Barra empilhada "para onde vai o dinheiro" com legenda e valores visíveis */
export function ParaOndeVai({ faturamento, comissoes, taxas }: { faturamento: number; comissoes: number; taxas: number }) {
  if (faturamento <= 0) return <p className="text-sm text-suave">Sem vendas no período.</p>;
  const sobra = Math.max(faturamento - comissoes - taxas, 0);
  const partes = [
    { rotulo: "Comissões", valor: comissoes, cor: COR_COMISSAO },
    { rotulo: "Taxas da maquininha", valor: taxas, cor: COR_TAXA },
    { rotulo: "Fica no salão", valor: sobra, cor: COR_SALAO },
  ];
  const pct = (v: number) => (v / faturamento) * 100;
  return (
    <div>
      <div className="flex h-8 w-full gap-[2px] overflow-hidden rounded" role="img"
        aria-label={partes.map((p) => `${p.rotulo} ${pct(p.valor).toFixed(0)}%`).join(", ")}>
        {partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.rotulo} className="group relative h-full first:rounded-l last:rounded-r" style={{ width: `${pct(p.valor)}%`, background: p.cor }}>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-escuro px-2 py-1 text-xs text-white group-hover:block">
              {p.rotulo}: {formatarReais(p.valor)} ({pct(p.valor).toFixed(1).replace(".", ",")}%)
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        {partes.map((p) => (
          <li key={p.rotulo} className="flex items-start gap-2">
            <span className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: p.cor }} aria-hidden />
            <span>
              <span className="block text-suave">{p.rotulo}</span>
              <span className="font-semibold">{formatarReais(p.valor)}</span>{" "}
              <span className="text-suave">({pct(p.valor).toFixed(0)}%)</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-suave">De cada R$ 100 vendidos, R$ {pct(sobra).toFixed(0)} ficam para o salão pagar as despesas e o lucro.</p>
    </div>
  );
}

/** Faturamento por dia: barras finas com valor no hover e tabela acessível */
export function BarrasPorDia({ dias }: { dias: { dia: string; valor: number }[] }) {
  const max = Math.max(...dias.map((d) => d.valor), 1);
  const rotuloDia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const marcar = dias.length <= 14 ? 1 : Math.ceil(dias.length / 10);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-suave">
        <span>máx. {formatarReais(max)}</span>
      </div>
      <div className="relative mt-1 flex h-44 items-end gap-[2px] border-b border-borda" role="img" aria-label="Faturamento por dia">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-borda/70" aria-hidden />
        {dias.map((d) => (
          <div key={d.dia} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
              style={{ height: d.valor > 0 ? `${Math.max((d.valor / max) * 100, 1.5)}%` : 0, background: COR_BARRA }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-escuro px-2 py-1 text-xs text-white group-hover:block">
              {rotuloDia(d.dia)}: {formatarReais(d.valor)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-suave">
        {dias.map((d, i) => (
          <span key={d.dia} className="flex-1 text-center">{i % marcar === 0 ? rotuloDia(d.dia) : ""}</span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-rose">Ver em tabela</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {dias.filter((d) => d.valor > 0).map((d) => (
            <li key={d.dia} className="flex justify-between border-b border-borda py-1"><span>{rotuloDia(d.dia)}</span><span>{formatarReais(d.valor)}</span></li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Lista com barra proporcional (um só tom) */
export function ListaComBarra({ linhas }: { linhas: { chave: string; rotulo: string; detalhe?: string; valor: number }[] }) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {linhas.map((l) => (
        <li key={l.chave}>
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{l.rotulo}{l.detalhe && <span className="text-suave"> · {l.detalhe}</span>}</span>
            <span className="shrink-0 font-semibold">{formatarReais(l.valor)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-fundo">
            <div className="h-full rounded-full" style={{ width: `${(l.valor / max) * 100}%`, background: COR_BARRA }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
