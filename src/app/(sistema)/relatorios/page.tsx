import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Cartao, Vazio, classeInput } from "@/components/ui";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MESES, formatarDiaISO, formatarReais, hojeISO } from "@/lib/formato";
import { dataPorExtenso, dataValida, diaDaSemana, somarDias } from "@/lib/agenda";
import { BarrasPorDia, ListaComBarra, ParaOndeVai } from "./graficos";

export const metadata: Metadata = { title: "Relatórios" };

type Modo = "dia" | "semana" | "mes" | "personalizado";

type Relatorio = {
  totais: { faturamento: number; caixinhas: number; taxas: number; comissoes: number; comandas: number; clientes: number };
  por_dia: { dia: string; valor: number }[];
  por_item: { tipo: string; descricao: string; quantidade: number; valor: number }[];
  por_forma: { forma: string; valor: number; taxa: number }[];
  por_profissional: { profissional_id: string; nome: string; faturamento: number; comissao: number; atendimentos: number; caixinhas: number }[];
};

const NOME_FORMA: Record<string, string> = { pix: "Pix", credito: "Crédito", debito: "Débito", dinheiro: "Dinheiro", saldo: "Saldo na casa" };

function intervalo(modo: Modo, ref: string, de?: string, ate?: string) {
  if (modo === "dia") return { inicio: ref, fim: ref, titulo: dataPorExtenso(ref, true) };
  if (modo === "semana") {
    const seg = somarDias(ref, -((diaDaSemana(ref) + 6) % 7)); // semana de segunda a domingo
    const dom = somarDias(seg, 6);
    return { inicio: seg, fim: dom, titulo: `Semana de ${formatarDiaISO(seg)} a ${formatarDiaISO(dom)}` };
  }
  if (modo === "mes") {
    const [a, m] = ref.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { inicio: `${ref.slice(0, 7)}-01`, fim: `${ref.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`, titulo: `${MESES[m - 1]} de ${a}` };
  }
  const i = de && dataValida(de) ? de : ref;
  const f = ate && dataValida(ate) && ate >= i ? ate : i;
  return { inicio: i, fim: f, titulo: `${formatarDiaISO(i)} a ${formatarDiaISO(f)}` };
}

function navegar(modo: Modo, ref: string, passo: 1 | -1) {
  if (modo === "dia") return somarDias(ref, passo);
  if (modo === "semana") return somarDias(ref, 7 * passo);
  const [a, m] = ref.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + passo, 1));
  return d.toISOString().slice(0, 10);
}

export default async function PaginaRelatorios({ searchParams }: PageProps<"/relatorios">) {
  await exigirDono();
  const sp = await searchParams;
  const modo: Modo = (["dia", "semana", "mes", "personalizado"] as const).find((m) => m === sp.modo) ?? "mes";
  const ref = dataValida(sp.data) ? sp.data : hojeISO();
  const { inicio, fim, titulo } = intervalo(modo, ref, sp.de as string | undefined, sp.ate as string | undefined);

  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("relatorio_vendas", { p_inicio: inicio, p_fim: fim });
  const r = data as Relatorio | null;
  const t = r?.totais ?? { faturamento: 0, caixinhas: 0, taxas: 0, comissoes: 0, comandas: 0, clientes: 0 };
  const resultado = t.faturamento - t.comissoes - t.taxas;

  // Todos os dias do período, inclusive os sem venda
  const porDiaMap = new Map((r?.por_dia ?? []).map((d) => [d.dia, d.valor]));
  const dias: { dia: string; valor: number }[] = [];
  for (let d = inicio; d <= fim && dias.length < 400; d = somarDias(d, 1)) dias.push({ dia: d, valor: porDiaMap.get(d) ?? 0 });

  const href = (m: Modo, data = ref) => `/relatorios?modo=${m}&data=${data}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      {/* Filtros: uma linha acima dos gráficos */}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-lg border border-borda bg-cartao p-1" aria-label="Período">
          {([["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["personalizado", "Personalizado"]] as const).map(([m, rot]) => (
            <Link key={m} href={href(m)} aria-current={modo === m ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-md px-3 text-sm font-semibold ${modo === m ? "bg-escuro text-sobre-escuro" : "text-suave hover:text-texto"}`}>
              {rot}
            </Link>
          ))}
        </nav>
        {modo !== "personalizado" ? (
          <>
            <Link href={href(modo, navegar(modo, ref, -1))} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Período anterior"><ChevronLeft size={20} /></Link>
            <Link href={href(modo, navegar(modo, ref, 1))} className="flex size-11 items-center justify-center rounded-lg border border-borda bg-cartao" aria-label="Próximo período"><ChevronRight size={20} /></Link>
          </>
        ) : (
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="modo" value="personalizado" />
            <input type="date" name="de" defaultValue={inicio} aria-label="De" className={classeInput.replace("w-full ", "")} />
            <span className="text-sm text-suave">a</span>
            <input type="date" name="ate" defaultValue={fim} aria-label="Até" className={classeInput.replace("w-full ", "")} />
            <button className="min-h-11 rounded-lg bg-rose px-4 text-sm font-semibold text-white">Ver</button>
          </form>
        )}
      </div>
      <h2 className="font-titulo text-3xl font-bold first-letter:uppercase">{titulo}</h2>

      {/* Visão geral */}
      <section aria-label="Visão geral" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Vendas (faturamento)" valor={formatarReais(t.faturamento)} destaque />
        <Indicador rotulo="Comissões" valor={formatarReais(t.comissoes)} />
        <Indicador rotulo="Taxas da maquininha" valor={formatarReais(t.taxas)} />
        <Indicador rotulo="Resultado" valor={formatarReais(resultado)} destaque dica="vendas − comissões − taxas" />
        <Indicador rotulo="Comandas fechadas" valor={String(t.comandas)} />
        <Indicador rotulo="Ticket médio" valor={formatarReais(t.comandas ? Math.round(t.faturamento / t.comandas) : 0)} />
        <Indicador rotulo="Clientes atendidas" valor={String(t.clientes)} />
        <Indicador rotulo="Caixinhas (repasse)" valor={formatarReais(t.caixinhas)} dica="não entram nas vendas" />
      </section>

      {t.comandas === 0 ? (
        <Vazio>Nenhuma comanda fechada neste período.</Vazio>
      ) : (
        <>
          <Cartao>
            <h3 className="mb-3 font-semibold">Para onde vai o dinheiro</h3>
            <ParaOndeVai faturamento={t.faturamento} comissoes={t.comissoes} taxas={t.taxas} />
          </Cartao>

          {dias.length > 1 && (
            <Cartao>
              <h3 className="mb-3 font-semibold">Vendas por dia</h3>
              <BarrasPorDia dias={dias} />
            </Cartao>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Cartao>
              <h3 className="mb-3 font-semibold">Por profissional</h3>
              <ul className="flex flex-col gap-3 text-sm">
                {(r?.por_profissional ?? []).map((p) => (
                  <li key={p.profissional_id} className="rounded-lg bg-fundo p-3">
                    <div className="flex justify-between gap-2"><strong>{p.nome}</strong><strong>{formatarReais(p.faturamento)}</strong></div>
                    <p className="text-xs text-suave">
                      {p.atendimentos} atendimento(s) · comissão {formatarReais(p.comissao)} · caixinhas {formatarReais(p.caixinhas)}
                    </p>
                  </li>
                ))}
              </ul>
            </Cartao>
            <Cartao>
              <h3 className="mb-3 font-semibold">Por forma de pagamento</h3>
              <ListaComBarra linhas={(r?.por_forma ?? []).map((f) => ({
                chave: f.forma, rotulo: NOME_FORMA[f.forma] ?? f.forma, valor: f.valor,
                detalhe: f.taxa > 0 ? `taxa ${formatarReais(f.taxa)}` : undefined,
              }))} />
              <p className="mt-3 text-xs text-suave">Valores recebidos, incluindo caixinhas.</p>
            </Cartao>
          </div>

          <Cartao>
            <h3 className="mb-3 font-semibold">Por item (serviços e produtos)</h3>
            <ListaComBarra linhas={(r?.por_item ?? []).slice(0, 20).map((i) => ({
              chave: `${i.tipo}-${i.descricao}`, rotulo: i.descricao,
              detalhe: `${i.quantidade}× ${i.tipo === "produto" ? "produto" : "serviço"}`, valor: i.valor,
            }))} />
            {(r?.por_item.length ?? 0) > 20 && <p className="mt-2 text-xs text-suave">Mostrando os 20 que mais faturaram.</p>}
          </Cartao>
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, destaque, dica }: { rotulo: string; valor: string; destaque?: boolean; dica?: string }) {
  return (
    <div className={`rounded-xl border bg-cartao p-3 ${destaque ? "border-rose-claro" : "border-borda"}`}>
      <p className="text-xs text-suave">{rotulo}</p>
      <p className={`mt-1 font-bold ${destaque ? "text-xl" : "text-lg"}`}>{valor}</p>
      {dica && <p className="text-[11px] text-suave">{dica}</p>}
    </div>
  );
}
