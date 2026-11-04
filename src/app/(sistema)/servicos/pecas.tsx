import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { BotaoLink } from "@/components/ui";

// Peças de lista usadas nas abas (no servidor e na lista filtrável de serviços).

export function Linha({ inativo, children, editarHref, ehDono, nome }: {
  inativo: boolean; children: ReactNode; editarHref: string; ehDono: boolean; nome: string;
}) {
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${inativo ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {ehDono && (
        <BotaoLink href={editarHref} variante="fantasma" className="shrink-0 px-2" aria-label={`Editar ${nome}`}>
          <Pencil size={18} />
        </BotaoLink>
      )}
    </li>
  );
}

export function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-borda bg-cartao">
      <h3 className="border-b border-borda bg-fundo/60 px-4 py-2 text-sm font-semibold text-rose">{titulo}</h3>
      <ul className="divide-y divide-borda">{children}</ul>
    </section>
  );
}
