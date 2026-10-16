import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Cartao, Titulo } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function Inicio() {
  const { profissional } = await exigirEquipe();
  const primeiroNome = profissional.nome.split(" ")[0];
  const ehDono = profissional.papel === "dono";

  const avisos: { texto: string; href: string }[] = [];
  if (ehDono) {
    const supabase = await criarClienteServidor();
    const { data: produtos } = await supabase.from("produtos").select("nome, estoque, estoque_minimo").eq("ativo", true);
    const baixos = (produtos ?? []).filter((p) => p.estoque <= p.estoque_minimo);
    if (baixos.length) {
      avisos.push({
        texto: `Estoque baixo: ${baixos.map((p) => p.nome).join(", ")}`,
        href: "/servicos?aba=produtos",
      });
    }
  }

  const atalhos = ehDono
    ? [
        { href: "/servicos", titulo: "Serviços e produtos", texto: "Cadastre serviços, produtos, pacotes e categorias." },
        { href: "/configuracoes/comissoes", titulo: "Regras de comissão", texto: "Percentual padrão, por categoria e por serviço." },
        { href: "/equipe", titulo: "Equipe", texto: "Profissionais, e-mails de acesso e cores da agenda." },
      ]
    : [
        { href: "/agenda", titulo: "Minha agenda", texto: "Seus atendimentos do dia." },
        { href: "/clientes", titulo: "Clientes", texto: "Fichas técnicas e anotações." },
        { href: "/comissoes", titulo: "Minhas comissões", texto: "Comissões, caixinhas e vales." },
      ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Titulo>Olá, {primeiroNome}!</Titulo>

      {avisos.map((a) => (
        <Link key={a.href} href={a.href} className="flex items-start gap-3 rounded-xl border border-aguardando/30 bg-aguardando-fundo p-4 text-sm text-aguardando">
          <AlertTriangle size={20} className="shrink-0" aria-hidden />
          <span className="font-medium">{a.texto}</span>
        </Link>
      ))}

      <div className="grid gap-4 sm:grid-cols-3">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Cartao className="h-full transition-colors group-hover:border-rose-claro">
              <p className="font-semibold text-rose">{a.titulo}</p>
              <p className="mt-1 text-sm text-suave">{a.texto}</p>
            </Cartao>
          </Link>
        ))}
      </div>
    </div>
  );
}
