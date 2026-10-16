import type { Metadata } from "next";
import Link from "next/link";
import { Cake, ChevronRight, Plus, Search } from "lucide-react";
import { BotaoLink, Etiqueta, Vazio, classeBotao, classeInput } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarAniversario, formatarTelefone, formatarReais, hojeISO } from "@/lib/formato";

export const metadata: Metadata = { title: "Clientes" };

const LIMITE = 100;

/** Remove acentos e deixa minúsculo, igual à coluna nome_busca do banco */
function paraBusca(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export default async function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  const { profissional } = await exigirEquipe();
  const ehDono = profissional.papel === "dono";
  const params = await searchParams;
  const busca = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("clientes")
    .select("id, nome, telefone, aniversario_dia, aniversario_mes")
    .eq("ativo", true)
    .order("nome")
    .limit(LIMITE);

  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    const soNumeros = digitos.length >= 3 && digitos.length === busca.replace(/[\s()+-]/g, "").length;
    consulta = soNumeros
      ? consulta.like("telefone", `%${digitos}%`)
      : consulta.like("nome_busca", `%${paraBusca(busca).replace(/[%_]/g, " ")}%`);
  }

  const { data } = await consulta;
  const clientes = data ?? [];

  const saldos = new Map<string, number>();
  if (ehDono && clientes.length) {
    const { data: s } = await supabase
      .from("saldos_clientes")
      .select("cliente_id, saldo_centavos")
      .in("cliente_id", clientes.map((c) => c.id));
    (s ?? []).forEach((x) => saldos.set(x.cliente_id, x.saldo_centavos));
  }

  const mesAtual = Number(hojeISO().slice(5, 7));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <form className="relative flex-1" role="search">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-suave" aria-hidden />
          <input
            name="q" type="search" defaultValue={busca} placeholder="Buscar por nome ou telefone"
            aria-label="Buscar cliente" className={`${classeInput} pl-10`}
          />
        </form>
        <BotaoLink href="/clientes/nova">
          <Plus size={18} aria-hidden /> Nova cliente
        </BotaoLink>
      </div>

      {busca && (
        <p className="text-sm text-suave">
          {clientes.length} resultado(s) para “{busca}”.{" "}
          <Link href="/clientes" className="font-semibold text-rose">Limpar busca</Link>
        </p>
      )}

      {clientes.length === 0 ? (
        <Vazio>
          {busca ? "Nenhuma cliente encontrada." : "Nenhuma cliente cadastrada ainda."}
          <br />
          <Link href="/clientes/nova" className={classeBotao("fantasma", "mt-2")}>Cadastrar cliente</Link>
        </Vazio>
      ) : (
        <ul className="divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-cartao">
          {clientes.map((c) => {
            const saldo = saldos.get(c.id) ?? 0;
            const anivMes = c.aniversario_mes === mesAtual;
            return (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-fundo">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-agendado-fundo font-semibold text-rose" aria-hidden>
                    {c.nome.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-sm text-suave">
                      {c.telefone && <span>{formatarTelefone(c.telefone)}</span>}
                      {anivMes && (
                        <span className="inline-flex items-center gap-1 text-rose">
                          <Cake size={14} aria-hidden /> {formatarAniversario(c.aniversario_dia, c.aniversario_mes)}
                        </span>
                      )}
                    </span>
                  </span>
                  {ehDono && saldo !== 0 && (
                    <Etiqueta tom={saldo > 0 ? "sucesso" : "erro"}>
                      {saldo > 0 ? "Crédito" : "Deve"} {formatarReais(Math.abs(saldo))}
                    </Etiqueta>
                  )}
                  <ChevronRight size={18} className="shrink-0 text-suave" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {clientes.length === LIMITE && (
        <p className="text-center text-sm text-suave">Mostrando as primeiras {LIMITE}. Use a busca para encontrar outras.</p>
      )}
    </div>
  );
}
