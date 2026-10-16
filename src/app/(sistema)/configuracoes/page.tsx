import type { Metadata } from "next";
import Link from "next/link";
import { Cartao, Etiqueta } from "@/components/ui";
import { exigirDono } from "@/lib/sessao";

export const metadata: Metadata = { title: "Configurações" };

const SECOES = [
  { href: "/configuracoes/comissoes", titulo: "Regras de comissão", texto: "Percentual padrão de cada profissional e por categoria.", pronto: true },
  { href: "/equipe", titulo: "Equipe e acessos", texto: "Profissionais, perfis e e-mails de login.", pronto: true },
  { titulo: "Taxas da maquininha", texto: "Débito, crédito e Pix.", pronto: false },
  { titulo: "Caixinha", texto: "Descontar taxa da maquininha da caixinha no cartão.", pronto: false },
  { titulo: "Dias de pagamento", texto: "Datas de pagamento das comissões.", pronto: false },
  { titulo: "Mensagens de WhatsApp", texto: "Confirmação de agendamento e aniversário.", pronto: false },
];

export default async function PaginaConfiguracoes() {
  await exigirDono();
  return (
    <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
      {SECOES.map((s) => {
        const conteudo = (
          <Cartao className={`h-full ${s.pronto ? "transition-colors hover:border-rose-claro" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className={`font-semibold ${s.pronto ? "text-rose" : ""}`}>{s.titulo}</p>
              {!s.pronto && <Etiqueta>Fase 7</Etiqueta>}
            </div>
            <p className="mt-1 text-sm text-suave">{s.texto}</p>
          </Cartao>
        );
        return s.href ? <Link key={s.titulo} href={s.href}>{conteudo}</Link> : <div key={s.titulo}>{conteudo}</div>;
      })}
    </div>
  );
}
