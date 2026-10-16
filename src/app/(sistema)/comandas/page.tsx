import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Receipt } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Abas, Cartao, Vazio } from "@/components/ui";
import { SeletorCliente } from "@/components/seletor-cliente";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarReais, hojeISO } from "@/lib/formato";
import { dataPorExtenso, dataValida, paraTimestamp, partesSP, somarDias } from "@/lib/agenda";
import { abrirComanda } from "./actions";

export const metadata: Metadata = { title: "Comandas" };

type Aberta = { id: string; numero: number; cliente_nome: string | null; aberta_em: string; profissionais: string | null; total?: number };

export default async function PaginaComandas({ searchParams }: PageProps<"/comandas">) {
  const { profissional: eu } = await exigirEquipe();
  const ehDono = eu.papel === "dono";
  const sp = await searchParams;
  const aba = ehDono && sp.aba === "fechadas" ? "fechadas" : "abertas";
  const supabase = await criarClienteServidor();

  let abertas: Aberta[] = [];
  if (ehDono) {
    const { data } = await supabase
      .from("comandas")
      .select("id, numero, aberta_em, clientes(nome), comanda_itens(valor_total_centavos, profissionais!comanda_itens_profissional_id_fkey(nome))")
      .eq("status", "aberta")
      .order("aberta_em");
    type Linha = { id: string; numero: number; aberta_em: string; clientes: { nome: string } | null; comanda_itens: { valor_total_centavos: number; profissionais: { nome: string } | null }[] };
    abertas = ((data ?? []) as unknown as Linha[]).map((c) => ({
      id: c.id, numero: c.numero, aberta_em: c.aberta_em, cliente_nome: c.clientes?.nome ?? null,
      profissionais: [...new Set(c.comanda_itens.map((i) => i.profissionais?.nome).filter(Boolean))].join(", ") || null,
      total: c.comanda_itens.reduce((t, i) => t + i.valor_total_centavos, 0),
    }));
  } else {
    const { data } = await supabase.rpc("comandas_abertas_equipe");
    abertas = (data ?? []) as Aberta[];
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {ehDono && (
        <Abas atual={aba} abas={[
          { id: "abertas", rotulo: `Abertas (${abertas.length})`, href: "/comandas" },
          { id: "fechadas", rotulo: "Fechadas", href: "/comandas?aba=fechadas" },
        ]} />
      )}

      {aba === "abertas" ? (
        <>
          <Cartao>
            <h2 className="mb-3 text-lg font-semibold">Nova comanda avulsa</h2>
            <p className="mb-3 text-sm text-suave">Para atendimentos da agenda, abra a comanda direto no agendamento.</p>
            <FormAcao acao={abrirComanda} className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1"><SeletorCliente /></div>
              <BotaoEnviar pendente="Abrindo…"><Receipt size={16} aria-hidden /> Abrir comanda</BotaoEnviar>
            </FormAcao>
            <p className="mt-2 text-xs text-suave">Sem escolher cliente, a comanda abre como “cliente não identificada” (ex.: venda rápida de produto).</p>
          </Cartao>

          {abertas.length === 0 ? (
            <Vazio>Nenhuma comanda aberta.</Vazio>
          ) : (
            <ul className="divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-cartao">
              {abertas.map((c) => (
                <li key={c.id}>
                  <Link href={`/comandas/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-fundo">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-atendimento-fundo text-sm font-bold text-atendimento">#{c.numero}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.cliente_nome ?? "Cliente não identificada"}</span>
                      <span className="block truncate text-sm text-suave">
                        Aberta às {partesSP(c.aberta_em).hora}
                        {partesSP(c.aberta_em).data !== hojeISO() && ` de ${partesSP(c.aberta_em).data.split("-").reverse().join("/")}`}
                        {c.profissionais && ` · ${c.profissionais}`}
                      </span>
                    </span>
                    {ehDono && <span className="font-semibold">{formatarReais(c.total ?? 0)}</span>}
                    <ChevronRight size={18} className="text-suave" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Fechadas data={dataValida(sp.data) ? sp.data : hojeISO()} />
      )}
    </div>
  );
}

async function Fechadas({ data }: { data: string }) {
  const supabase = await criarClienteServidor();
  const { data: linhas } = await supabase
    .from("comandas")
    .select("id, numero, status, fechada_em, cancelada_em, total_itens_centavos, total_caixinhas_centavos, clientes(nome)")
    .in("status", ["fechada", "cancelada"])
    .or(`and(fechada_em.gte.${paraTimestamp(data, "00:00")},fechada_em.lt.${paraTimestamp(somarDias(data, 1), "00:00")}),and(cancelada_em.gte.${paraTimestamp(data, "00:00")},cancelada_em.lt.${paraTimestamp(somarDias(data, 1), "00:00")})`)
    .order("fechada_em", { ascending: false });
  type Linha = { id: string; numero: number; status: string; fechada_em: string | null; cancelada_em: string | null; total_itens_centavos: number | null; total_caixinhas_centavos: number | null; clientes: { nome: string } | null };
  const lista = (linhas ?? []) as unknown as Linha[];
  const fechadas = lista.filter((c) => c.status === "fechada");
  const totalDia = fechadas.reduce((t, c) => t + (c.total_itens_centavos ?? 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/comandas?aba=fechadas&data=${somarDias(data, -1)}`} className="flex min-h-11 items-center rounded-lg border border-borda bg-cartao px-3 text-sm">◀</Link>
        <Link href={`/comandas?aba=fechadas&data=${somarDias(data, 1)}`} className="flex min-h-11 items-center rounded-lg border border-borda bg-cartao px-3 text-sm">▶</Link>
        <h2 className="font-titulo text-2xl font-bold first-letter:uppercase">{dataPorExtenso(data, true)}</h2>
        <form className="ml-auto flex gap-1">
          <input type="hidden" name="aba" value="fechadas" />
          <input type="date" name="data" defaultValue={data} aria-label="Escolher dia" className="min-h-11 rounded-lg border border-borda bg-cartao px-2 text-sm" />
          <button className="min-h-11 rounded-lg bg-rose px-3 text-sm font-semibold text-white">Ir</button>
        </form>
      </div>
      <Cartao className="flex flex-wrap gap-6">
        <div><p className="text-xs text-suave">Comandas fechadas</p><p className="text-xl font-bold">{fechadas.length}</p></div>
        <div><p className="text-xs text-suave">Faturamento do dia (sem caixinhas)</p><p className="text-xl font-bold">{formatarReais(totalDia)}</p></div>
      </Cartao>
      {lista.length === 0 ? (
        <Vazio>Nenhuma comanda fechada neste dia.</Vazio>
      ) : (
        <ul className="divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-cartao">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/comandas/${c.id}`} className={`flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-fundo ${c.status === "cancelada" ? "opacity-60" : ""}`}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-concluido-fundo text-sm font-bold text-suave">#{c.numero}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.clientes?.nome ?? "Cliente não identificada"}</span>
                  <span className="text-sm text-suave">
                    {c.status === "cancelada" ? `Cancelada às ${partesSP(c.cancelada_em!).hora}` : `Fechada às ${partesSP(c.fechada_em!).hora}`}
                    {(c.total_caixinhas_centavos ?? 0) > 0 && ` · caixinhas ${formatarReais(c.total_caixinhas_centavos!)}`}
                  </span>
                </span>
                {c.status === "fechada" && <span className="font-semibold">{formatarReais(c.total_itens_centavos ?? 0)}</span>}
                <ChevronRight size={18} className="text-suave" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
