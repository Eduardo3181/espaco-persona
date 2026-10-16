import Link from "next/link";
import { Cake, MessageCircle } from "lucide-react";
import { Cartao } from "@/components/ui";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterConfigEquipe, preencherMensagem } from "@/lib/config";
import { hojeISO, linkWhatsApp } from "@/lib/formato";
import { DIAS_SEMANA, diaDaSemana, somarDias } from "@/lib/agenda";

/** Clientes que fazem aniversário hoje e nos próximos 7 dias, com WhatsApp pronto. */
export async function Aniversariantes() {
  const hoje = hojeISO();
  const proximos = Array.from({ length: 8 }, (_, i) => somarDias(hoje, i));
  const filtro = proximos
    .map((d) => `and(aniversario_dia.eq.${Number(d.slice(8, 10))},aniversario_mes.eq.${Number(d.slice(5, 7))})`)
    .join(",");

  const supabase = await criarClienteServidor();
  const [{ data }, { msgAniversario }] = await Promise.all([
    supabase.from("clientes").select("id, nome, telefone, aniversario_dia, aniversario_mes").eq("ativo", true).or(filtro),
    obterConfigEquipe(),
  ]);
  if (!data?.length) return null;

  const diaDe = (c: { aniversario_dia: number; aniversario_mes: number }) =>
    proximos.find((d) => Number(d.slice(8, 10)) === c.aniversario_dia && Number(d.slice(5, 7)) === c.aniversario_mes) ?? hoje;
  const lista = data.map((c) => ({ ...c, quando: diaDe(c) })).sort((a, b) => a.quando.localeCompare(b.quando) || a.nome.localeCompare(b.nome));

  return (
    <Cartao>
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Cake size={18} className="text-rose" aria-hidden /> Aniversariantes da semana</h2>
      <ul className="divide-y divide-borda text-sm">
        {lista.map((c) => {
          const ddmm = `${c.quando.slice(8, 10)}/${c.quando.slice(5, 7)}`;
          const ehHoje = c.quando === hoje;
          const msg = preencherMensagem(msgAniversario, { cliente: c.nome.split(" ")[0], data: ddmm });
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link>
                <span className={`block text-xs ${ehHoje ? "font-semibold text-rose" : "text-suave"}`}>
                  {ehHoje ? "Hoje! 🎉" : `${DIAS_SEMANA[diaDaSemana(c.quando)]}, ${ddmm}`}
                </span>
              </span>
              {c.telefone ? (
                <a href={linkWhatsApp(c.telefone, msg)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sucesso px-3 text-sm font-semibold text-white hover:opacity-90">
                  <MessageCircle size={16} aria-hidden /> Parabéns
                </a>
              ) : (
                <span className="text-xs text-suave">sem telefone</span>
              )}
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}
