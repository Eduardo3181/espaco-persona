import type { Metadata } from "next";
import { Abas } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { RegraComissao } from "@/lib/comissao";
import { AbaCategorias, AbaPacotes, AbaProdutos, AbaServicos, type Dados } from "./abas";

export const metadata: Metadata = { title: "Serviços e produtos" };

const ABAS = [
  { id: "servicos", rotulo: "Serviços" },
  { id: "produtos", rotulo: "Produtos" },
  { id: "pacotes", rotulo: "Pacotes" },
  { id: "categorias", rotulo: "Categorias" },
];

export default async function PaginaServicos({ searchParams }: PageProps<"/servicos">) {
  const { profissional } = await exigirEquipe();
  const ehDono = profissional.papel === "dono";
  const params = await searchParams;
  const aba = ABAS.some((a) => a.id === params.aba) ? String(params.aba) : "servicos";
  const editar = ehDono && typeof params.editar === "string" ? params.editar : undefined;

  const supabase = await criarClienteServidor();
  const [categorias, servicos, produtos, pacotes, pacoteServicos, profissionais, regras] = await Promise.all([
    supabase.from("categorias").select("*").order("nome"),
    supabase.from("servicos").select("*").order("nome"),
    supabase.from("produtos").select("*").order("nome"),
    supabase.from("pacotes").select("*").order("nome"),
    supabase.from("pacote_servicos").select("*"),
    supabase.from("profissionais").select("id, nome, recebe_comissao, ativo").eq("ativo", true).order("nome"),
    ehDono ? supabase.from("regras_comissao").select("*") : Promise.resolve({ data: [] as RegraComissao[] }),
  ]);

  const dados: Dados = {
    categorias: categorias.data ?? [],
    servicos: servicos.data ?? [],
    produtos: produtos.data ?? [],
    pacotes: pacotes.data ?? [],
    pacoteServicos: pacoteServicos.data ?? [],
    profissionais: (profissionais.data ?? []).filter((p) => p.recebe_comissao),
    regras: (regras.data ?? []) as RegraComissao[],
  };

  const props = { dados, ehDono, editar };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Abas atual={aba} abas={ABAS.map((a) => ({ ...a, href: `/servicos?aba=${a.id}` }))} />
      {aba === "servicos" && <AbaServicos {...props} />}
      {aba === "produtos" && <AbaProdutos {...props} />}
      {aba === "pacotes" && <AbaPacotes {...props} />}
      {aba === "categorias" && <AbaCategorias {...props} />}
    </div>
  );
}
