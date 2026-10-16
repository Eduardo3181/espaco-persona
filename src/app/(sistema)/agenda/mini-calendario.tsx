import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DIAS_CURTOS, diaDaSemana, somarDias } from "@/lib/agenda";
import { MESES } from "@/lib/formato";

/** Calendário do mês para escolher o dia da agenda. `mes` = "AAAA-MM" exibido. */
export function MiniCalendario({ selecionado, hoje, mes, href }: {
  selecionado: string;
  hoje: string;
  mes: string;
  href: (params: { data?: string; mes?: string }) => string;
}) {
  const primeiro = `${mes}-01`;
  const [ano, m] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const vazios = diaDaSemana(primeiro);
  const mesAnterior = somarDias(primeiro, -1).slice(0, 7);
  const mesSeguinte = somarDias(primeiro, diasNoMes).slice(0, 7);

  return (
    <div className="rounded-xl border border-borda bg-cartao p-3">
      <div className="mb-2 flex items-center justify-between">
        <Link href={href({ mes: mesAnterior })} className="flex size-9 items-center justify-center rounded-lg hover:bg-fundo" aria-label="Mês anterior">
          <ChevronLeft size={18} />
        </Link>
        <p className="text-sm font-semibold capitalize">{MESES[m - 1]} {ano}</p>
        <Link href={href({ mes: mesSeguinte })} className="flex size-9 items-center justify-center rounded-lg hover:bg-fundo" aria-label="Próximo mês">
          <ChevronRight size={18} />
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {DIAS_CURTOS.map((d, i) => <span key={i} className="py-1 font-semibold text-suave" aria-hidden>{d}</span>)}
        {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const data = `${mes}-${String(i + 1).padStart(2, "0")}`;
          const sel = data === selecionado;
          return (
            <Link
              key={data}
              href={href({ data })}
              aria-current={sel ? "date" : undefined}
              className={`flex aspect-square min-h-9 items-center justify-center rounded-lg text-sm ${
                sel ? "bg-rose font-semibold text-white" : data === hoje ? "font-bold text-rose ring-1 ring-rose-claro" : "hover:bg-fundo"
              }`}
            >
              {i + 1}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
