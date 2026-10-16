import "server-only";
import type { UsuarioAtual } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;
type Eu = NonNullable<UsuarioAtual["profissional"]>;

/** Profissionais que a pessoa pode usar na agenda: o dono vê todas; a profissional, só ela. */
export async function profissionaisDaAgenda(supabase: Supabase, eu: Eu) {
  const q = supabase.from("profissionais").select("id, nome").eq("ativo", true).order("ordem").order("nome");
  const { data } = eu.papel === "dono" ? await q : await q.eq("id", eu.id);
  return data ?? [];
}

/** Serviços ativos com a categoria, para escolher no agendamento. */
export async function servicosParaAgenda(supabase: Supabase, incluirIds: string[] = []) {
  const { data } = await supabase
    .from("servicos")
    .select("id, nome, duracao_min, preco_centavos, ativo, categorias(nome)")
    .order("nome");
  type Linha = { id: string; nome: string; duracao_min: number; preco_centavos: number; ativo: boolean; categorias: { nome: string } | null };
  return ((data ?? []) as unknown as Linha[])
    .filter((s) => s.ativo || incluirIds.includes(s.id))
    .map((s) => ({ id: s.id, nome: s.nome, duracao_min: s.duracao_min, preco_centavos: s.preco_centavos, categoria: s.categorias?.nome ?? "Outros" }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
}
