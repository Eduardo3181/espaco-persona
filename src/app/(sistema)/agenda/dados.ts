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

/** Categorias que cada profissional não pode lançar: { profissional: [categorias] } */
export async function categoriasBloqueadas(supabase: Supabase) {
  const { data } = await supabase.from("profissional_categorias_bloqueadas").select("profissional_id, categoria_id");
  const mapa: Record<string, string[]> = {};
  for (const b of data ?? []) (mapa[b.profissional_id] ??= []).push(b.categoria_id);
  return mapa;
}

/** Serviços ativos com a categoria, para escolher no agendamento. */
export async function servicosParaAgenda(supabase: Supabase, incluirIds: string[] = []) {
  const { data } = await supabase
    .from("servicos")
    .select("id, nome, duracao_min, preco_centavos, ativo, categoria_id, categorias(nome)")
    .order("nome");
  type Linha = { id: string; nome: string; duracao_min: number; preco_centavos: number; ativo: boolean; categoria_id: string; categorias: { nome: string } | null };
  return ((data ?? []) as unknown as Linha[])
    .filter((s) => s.ativo || incluirIds.includes(s.id))
    .map((s) => ({ id: s.id, nome: s.nome, duracao_min: s.duracao_min, preco_centavos: s.preco_centavos, categoria_id: s.categoria_id, categoria: s.categorias?.nome ?? "Outros" }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Horários de uma recorrência que ainda podem mudar: não atendidos e ainda por
 * vir (o próprio horário aberto na tela sempre entra). Atendidos, com comanda,
 * desmarcados e datas que já passaram ficam como estão, para preservar o histórico.
 */
export async function horariosAbertosDaSerie(supabase: Supabase, grupo: string, idAtual: string, profissionalId?: string) {
  let q = supabase
    .from("agendamentos")
    .select("id, inicio, fim")
    .eq("grupo_repeticao", grupo)
    .eq("tipo", "atendimento")
    .in("status", ["aguardando", "confirmado"])
    .order("inicio");
  if (profissionalId) q = q.eq("profissional_id", profissionalId);
  const { data } = await q;
  const agora = Date.now();
  return (data ?? []).filter((h) => h.id === idAtual || new Date(h.inicio).getTime() >= agora);
}
