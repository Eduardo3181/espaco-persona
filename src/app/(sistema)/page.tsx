import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Cartao, Titulo } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarReais, hojeISO } from "@/lib/formato";
import { periodoDaData } from "@/lib/periodo";
import { obterConfigEquipe } from "@/lib/config";
import { Aniversariantes } from "@/components/aniversariantes";

export default async function Inicio() {
  const { profissional } = await exigirEquipe();
  const primeiroNome = profissional.nome.split(" ")[0];
  const ehDono = profissional.papel === "dono";

  const avisos: { texto: string; href: string }[] = [];
  const supabase = await criarClienteServidor();
  let aReceber: { valor: number; dia: string } | null = null;
  if (!ehDono) {
    const periodo = periodoDaData(hojeISO(), (await obterConfigEquipe()).dias);
    const { data } = await supabase.rpc("extrato_profissional", { p_profissional_id: profissional.id, p_inicio: periodo.inicio, p_fim: periodo.fim });
    const linhas = (data ?? []) as { valor_centavos: number; pagamento_id: string | null }[];
    aReceber = { valor: linhas.filter((l) => !l.pagamento_id).reduce((t, l) => t + l.valor_centavos, 0), dia: periodo.pagamento.split("-").reverse().slice(0, 2).join("/") };
  }
  if (ehDono) {
    const { count: abertas } = await supabase.from("comandas").select("id", { count: "exact", head: true }).eq("status", "aberta");
    if (abertas) avisos.push({ texto: `${abertas} comanda(s) aberta(s)`, href: "/comandas" });
    const { data: produtos } = await supabase.from("produtos").select("nome, estoque, estoque_minimo").eq("ativo", true);
    const baixos = (produtos ?? []).filter((p) => p.estoque_minimo > 0 && p.estoque <= p.estoque_minimo);
    if (baixos.length) {
      avisos.push({
        texto: `Estoque baixo: ${baixos.map((p) => p.nome).join(", ")}`,
        href: "/servicos?aba=produtos",
      });
    }
  }

  const atalhos = ehDono
    ? [
        { href: "/agenda", titulo: "Agenda", texto: "Atendimentos do dia de toda a equipe." },
        { href: "/comandas", titulo: "Comandas", texto: "Comandas abertas e fechamento." },
        { href: "/comissoes", titulo: "Comissões", texto: "A pagar no período e pagamentos feitos." },
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

      {aReceber && (
        <Link href="/comissoes" className="block">
          <Cartao className="border-rose-claro bg-agendado-fundo/40">
            <p className="text-sm text-suave">Você recebe em {aReceber.dia}</p>
            <p className="font-titulo text-3xl font-bold text-rose">{formatarReais(aReceber.valor)}</p>
            <p className="text-xs text-suave">Comissões + caixinhas do período · ver extrato</p>
          </Cartao>
        </Link>
      )}

      {avisos.map((a) => (
        <Link key={a.href} href={a.href} className="flex items-start gap-3 rounded-xl border border-aguardando/30 bg-aguardando-fundo p-4 text-sm text-aguardando">
          <AlertTriangle size={20} className="shrink-0" aria-hidden />
          <span className="font-medium">{a.texto}</span>
        </Link>
      ))}

      <Aniversariantes />

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
