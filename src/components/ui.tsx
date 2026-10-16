import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Peças visuais reaproveitadas em todas as telas.

type VarianteBotao = "primario" | "secundario" | "perigo" | "fantasma";

const variantes: Record<VarianteBotao, string> = {
  primario: "bg-rose text-white hover:bg-rose-escuro",
  secundario: "bg-cartao text-texto border border-borda hover:border-rose-claro",
  perigo: "bg-cartao text-erro border border-borda hover:border-erro",
  fantasma: "text-rose hover:bg-agendado-fundo",
};

export function classeBotao(variante: VarianteBotao = "primario", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${variantes[variante]} ${extra}`;
}

export const classeInput =
  "min-h-11 w-full rounded-lg border border-borda bg-cartao px-3 text-sm text-texto placeholder:text-suave/70 focus:border-rose focus:outline-none";

export function BotaoLink({ variante = "primario", className = "", ...props }: ComponentProps<typeof Link> & { variante?: VarianteBotao }) {
  return <Link className={classeBotao(variante, className)} {...props} />;
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-borda bg-cartao p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="font-titulo text-2xl font-bold text-texto">{children}</h2>;
}

export function Campo({ rotulo, dica, children, className = "" }: { rotulo: string; dica?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-texto">{rotulo}</span>
      {children}
      {dica && <span className="text-xs text-suave">{dica}</span>}
    </label>
  );
}

type Tom = "rose" | "aviso" | "sucesso" | "erro" | "neutro";
const tons: Record<Tom, string> = {
  rose: "bg-agendado-fundo text-agendado",
  aviso: "bg-aguardando-fundo text-aguardando",
  sucesso: "bg-[#E3EFE5] text-sucesso",
  erro: "bg-[#F6E3E3] text-erro",
  neutro: "bg-concluido-fundo text-suave",
};

export function Etiqueta({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tons[tom]}`}>{children}</span>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-suave">{children}</p>;
}

export function Abas({ abas, atual }: { abas: { id: string; rotulo: string; href: string }[]; atual: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-borda" aria-label="Abas">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={a.id === atual ? "page" : undefined}
          className={`flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold ${
            a.id === atual ? "border-rose text-rose" : "border-transparent text-suave hover:text-texto"
          }`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
