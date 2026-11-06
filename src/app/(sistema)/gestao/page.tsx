import type { Metadata } from "next";
import { Abas } from "@/components/ui";
import { hojeISO } from "@/lib/formato";
import { exigirDono } from "@/lib/sessao";
import { AbaAnalise } from "./analise";
import { AbaFluxo } from "./fluxo";
import { AbaLancamentos } from "./lancamentos";
import { AbaMetas } from "./metas";
import { AbaPainel } from "./painel";
import { AbaPlano } from "./plano";

export const metadata: Metadata = { title: "Gestão" };

const ABAS = [
  { id: "painel", rotulo: "Painel" },
  { id: "lancamentos", rotulo: "Lançamentos" },
  { id: "fluxo", rotulo: "Fluxo de caixa" },
  { id: "analise", rotulo: "Análise" },
  { id: "metas", rotulo: "Metas" },
  { id: "plano", rotulo: "Plano de contas" },
];

export default async function PaginaGestao({ searchParams }: PageProps<"/gestao">) {
  await exigirDono();
  const sp = await searchParams;
  const s = (campo: string) => (typeof sp[campo] === "string" ? (sp[campo] as string) : undefined);
  const aba = ABAS.some((a) => a.id === s("aba")) ? s("aba")! : "painel";
  const hoje = hojeISO();
  const anoInformado = Number(s("ano"));
  const ano = Number.isInteger(anoInformado) && anoInformado >= 2000 && anoInformado <= 2100 ? anoInformado : Number(hoje.slice(0, 4));
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(s("mes") ?? "") ? s("mes")! : hoje.slice(0, 7);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Abas atual={aba} abas={ABAS.map((a) => ({ ...a, href: `/gestao?aba=${a.id}` }))} />
      {aba === "painel" && <AbaPainel ano={ano} />}
      {aba === "lancamentos" && <AbaLancamentos mes={mes} tipo={s("tipo") ?? "todos"} situacao={s("situacao") ?? "todos"} editar={s("editar")} />}
      {aba === "fluxo" && <AbaFluxo ano={ano} visao={s("visao") === "analitico" ? "analitico" : "geral"} />}
      {aba === "analise" && <AbaAnalise de1={s("de1")} ate1={s("ate1")} de2={s("de2")} ate2={s("ate2")} />}
      {aba === "metas" && <AbaMetas editar={s("editar")} />}
      {aba === "plano" && <AbaPlano editar={s("editar")} />}
    </div>
  );
}
