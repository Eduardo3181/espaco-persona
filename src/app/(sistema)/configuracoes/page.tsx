import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, Cartao, classeInput } from "@/components/ui";
import { exigirDono } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { preencherMensagem } from "@/lib/config";
import { diasValidos, periodoDaData } from "@/lib/periodo";
import { formatarDiaISO, hojeISO } from "@/lib/formato";
import { salvarFinanceiro, salvarMensagens } from "./actions";

export const metadata: Metadata = { title: "Configurações" };

const paraCampo = (n: number) => String(Number(n)).replace(".", ",");
const campoCurto = classeInput.replace("w-full ", "");

export default async function PaginaConfiguracoes({ searchParams }: PageProps<"/configuracoes">) {
  await exigirDono();
  const { salvo } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: c } = await supabase.from("configuracoes").select("*").single();
  const dias = diasValidos(c?.dias_pagamento);
  const periodoAtual = periodoDaData(hojeISO(), dias);
  const exemplo = { cliente: "Ana", data: "sexta-feira, 17/10", hora: "14:00", profissional: "Valdete" };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/configuracoes/comissoes", titulo: "Regras de comissão", texto: "Padrão de cada profissional e por categoria." },
          { href: "/equipe", titulo: "Equipe e acessos", texto: "Profissionais, perfis, e-mails de login e desativar acesso." },
        ].map((s) => (
          <Link key={s.href} href={s.href}>
            <Cartao className="flex h-full items-center gap-3 transition-colors hover:border-rose-claro">
              <span className="flex-1">
                <span className="block font-semibold text-rose">{s.titulo}</span>
                <span className="text-sm text-suave">{s.texto}</span>
              </span>
              <ChevronRight size={18} className="text-suave" aria-hidden />
            </Cartao>
          </Link>
        ))}
      </div>

      {salvo && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-sucesso/30 bg-[#E3EFE5] px-3 py-2 text-sm font-semibold text-sucesso">
          <CheckCircle2 size={18} aria-hidden /> Configurações salvas.
        </p>
      )}

      {/* Financeiro */}
      <Cartao>
        <h2 className="mb-4 text-lg font-semibold">Maquininha, caixinha e pagamento de comissões</h2>
        <FormAcao acao={salvarFinanceiro} className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Taxas da maquininha (%)</legend>
            <div className="flex flex-wrap gap-3">
              <Campo rotulo="Débito"><input name="taxa_debito" inputMode="decimal" required defaultValue={paraCampo(c?.taxa_debito ?? 1.99)} className={`${campoCurto} w-28`} /></Campo>
              <Campo rotulo="Crédito"><input name="taxa_credito" inputMode="decimal" required defaultValue={paraCampo(c?.taxa_credito ?? 3.49)} className={`${campoCurto} w-28`} /></Campo>
              <Campo rotulo="Pix"><input name="taxa_pix" inputMode="decimal" defaultValue={paraCampo(c?.taxa_pix ?? 0)} className={`${campoCurto} w-28`} /></Campo>
            </div>
            <p className="mt-1 text-xs text-suave">Valem para as comandas fechadas a partir de agora; as antigas guardam a taxa usada.</p>
          </fieldset>

          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name="caixinha_desconta_taxa" defaultChecked={Boolean(c?.caixinha_desconta_taxa)} className="mt-0.5 size-5 accent-rose" />
            <span>
              <strong>Descontar a taxa da maquininha da caixinha paga no cartão</strong>
              <span className="block text-xs text-suave">Desligado: a profissional recebe a caixinha inteira e o salão paga a taxa.</span>
            </span>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Dias de pagamento das comissões</legend>
            <div className="flex flex-wrap items-end gap-3">
              <Campo rotulo="1º dia"><input name="dia1" type="number" min={1} max={27} required defaultValue={dias[0]} className={`${campoCurto} w-24`} /></Campo>
              <Campo rotulo="2º dia"><input name="dia2" type="number" min={2} max={28} required defaultValue={dias[1]} className={`${campoCurto} w-24`} /></Campo>
            </div>
            <p className="mt-1 text-xs text-suave">
              Cada período vai de um dia de pagamento até a véspera do seguinte. Hoje: período {periodoAtual.rotulo}, pago em {formatarDiaISO(periodoAtual.pagamento)}.
              Mude só entre um pagamento e outro, para não deixar dias sem período.
            </p>
          </fieldset>

          <div><BotaoEnviar>Salvar</BotaoEnviar></div>
        </FormAcao>
      </Cartao>

      {/* Mensagens */}
      <Cartao>
        <h2 className="mb-1 text-lg font-semibold">Mensagens de WhatsApp</h2>
        <p className="mb-4 text-sm text-suave">
          Use <code className="rounded bg-fundo px-1">{"{cliente}"}</code>, <code className="rounded bg-fundo px-1">{"{data}"}</code>,{" "}
          <code className="rounded bg-fundo px-1">{"{hora}"}</code> e <code className="rounded bg-fundo px-1">{"{profissional}"}</code>: o sistema troca pelos dados de verdade.
        </p>
        <FormAcao acao={salvarMensagens} className="flex flex-col gap-4">
          <Campo rotulo="Confirmação de agendamento">
            <textarea name="msg_confirmacao" required rows={3} defaultValue={c?.msg_confirmacao ?? ""} className={`${classeInput} py-2`} />
          </Campo>
          <p className="-mt-2 rounded-lg bg-fundo p-2 text-xs text-suave">Exemplo: {preencherMensagem(c?.msg_confirmacao ?? "", exemplo)}</p>
          <Campo rotulo="Aniversário">
            <textarea name="msg_aniversario" required rows={3} defaultValue={c?.msg_aniversario ?? ""} className={`${classeInput} py-2`} />
          </Campo>
          <p className="-mt-2 rounded-lg bg-fundo p-2 text-xs text-suave">Exemplo: {preencherMensagem(c?.msg_aniversario ?? "", exemplo)}</p>
          <div><BotaoEnviar>Salvar mensagens</BotaoEnviar></div>
        </FormAcao>
      </Cartao>
    </div>
  );
}
