import { Cartao } from "@/components/ui";

/** Tela provisória para módulos das próximas fases. */
export function EmBreve({ modulo, fase }: { modulo: string; fase: number }) {
  return (
    <Cartao className="mx-auto max-w-lg text-center">
      <p className="font-titulo text-2xl font-bold">{modulo}</p>
      <p className="mt-2 text-sm text-suave">Em breve. Este módulo será construído na fase {fase}.</p>
    </Cartao>
  );
}
