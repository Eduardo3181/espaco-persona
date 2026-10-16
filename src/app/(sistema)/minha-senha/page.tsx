import type { Metadata } from "next";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, Cartao, classeInput } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { trocarSenha } from "./actions";

export const metadata: Metadata = { title: "Minha senha" };

export default async function MinhaSenha({ searchParams }: PageProps<"/minha-senha">) {
  const { email } = await exigirEquipe();
  const { salvo } = await searchParams;
  return (
    <Cartao className="mx-auto max-w-md">
      <h2 className="mb-1 text-lg font-semibold">Alterar minha senha</h2>
      <p className="mb-4 text-sm text-suave">Login: {email}</p>
      {salvo ? (
        <p role="status" className="rounded-lg border border-sucesso/30 bg-[#E3EFE5] px-3 py-2 text-sm font-semibold text-sucesso">
          Senha alterada! Use a nova senha no próximo login.
        </p>
      ) : (
        <FormAcao acao={trocarSenha} className="flex flex-col gap-4">
          <Campo rotulo="Nova senha" dica="Pelo menos 8 caracteres.">
            <input name="senha" type="password" autoComplete="new-password" minLength={8} required className={classeInput} />
          </Campo>
          <Campo rotulo="Repita a nova senha">
            <input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required className={classeInput} />
          </Campo>
          <div><BotaoEnviar>Salvar nova senha</BotaoEnviar></div>
        </FormAcao>
      )}
    </Cartao>
  );
}
