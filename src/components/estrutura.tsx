"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  CalendarDays, ChartColumn, House, Menu, Receipt, Scissors, Settings, UserRound, Users, Wallet, X, LogOut, HandCoins,
} from "lucide-react";
import type { Papel } from "@/lib/sessao";

type ItemMenu = { href: string; rotulo: string; icone: typeof House; soDono?: boolean };

const ITENS: ItemMenu[] = [
  { href: "/", rotulo: "Início", icone: House },
  { href: "/agenda", rotulo: "Agenda", icone: CalendarDays },
  { href: "/comandas", rotulo: "Comandas", icone: Receipt, soDono: true },
  { href: "/clientes", rotulo: "Clientes", icone: UserRound },
  { href: "/servicos", rotulo: "Serviços e produtos", icone: Scissors },
  { href: "/comissoes", rotulo: "Comissões", icone: HandCoins },
  { href: "/despesas", rotulo: "Despesas", icone: Wallet, soDono: true },
  { href: "/relatorios", rotulo: "Relatórios", icone: ChartColumn, soDono: true },
  { href: "/equipe", rotulo: "Equipe", icone: Users, soDono: true },
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings, soDono: true },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** Menu lateral escuro (no celular vira barra no topo) + cabeçalho com título e usuário. */
export function Estrutura({
  papel,
  nome,
  acaoSair,
  children,
}: {
  papel: Papel;
  nome: string;
  acaoSair: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const itens = ITENS.filter((i) => papel === "dono" || !i.soDono);
  const titulo = itens.filter((i) => ativo(pathname, i.href)).at(-1)?.rotulo ?? "Espaço Persona";

  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-escuro text-sobre-escuro md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col">
        <div className="flex items-center justify-between px-4 py-3 md:justify-center md:py-6">
          <Link href="/" onClick={() => setAberto(false)}>
            <Image src="/logo-persona.png" alt="Espaço Persona – Hair and Beauty" width={160} height={160} priority className="h-12 w-auto md:h-auto md:w-36" />
          </Link>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg md:hidden"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls="menu-principal"
            aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          >
            {aberto ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <nav id="menu-principal" className={`${aberto ? "block" : "hidden"} px-3 pb-4 md:block md:flex-1 md:overflow-y-auto`}>
          <ul className="flex flex-col gap-1">
            {itens.map((item) => {
              const Icone = item.icone;
              const atual = ativo(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setAberto(false)}
                    aria-current={atual ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      atual ? "bg-rose text-white" : "text-sobre-escuro/85 hover:bg-escuro-2 hover:text-sobre-escuro"
                    }`}
                  >
                    <Icone size={18} aria-hidden />
                    {item.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
          <form action={acaoSair} className="mt-4 border-t border-white/10 pt-4 md:hidden">
            <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-sobre-escuro/85 hover:bg-escuro-2">
              <LogOut size={18} aria-hidden /> Sair
            </button>
          </form>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:ml-64">
        <header className="flex items-center justify-between gap-4 border-b border-borda bg-cartao px-4 py-3 sm:px-6">
          <h1 className="font-titulo text-2xl font-bold sm:text-3xl">{titulo}</h1>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm leading-tight">
              <p className="font-semibold">{nome}</p>
              <p className="text-xs text-suave">{papel === "dono" ? "Dono" : "Profissional"}</p>
            </div>
            <form action={acaoSair} className="hidden md:block">
              <button className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-suave hover:bg-fundo hover:text-texto" aria-label="Sair" title="Sair">
                <LogOut size={20} />
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
