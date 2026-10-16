import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, classeInput } from "@/components/ui";
import { pedirNovaSenha } from "../actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function EsqueciSenha({ searchParams }: PageProps<"/login/esqueci">) {
  const { enviado } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-escuro px-4 py-10">
      <Image src="/logo-persona.png" alt="Espaço Persona – Hair and Beauty" width={220} height={220} priority className="mb-8 h-auto w-44 sm:w-52" />
      <div className="w-full max-w-sm rounded-2xl bg-cartao p-6 shadow-xl">
        <h1 className="mb-1 font-titulo text-3xl font-bold">Esqueci minha senha</h1>
        {enviado ? (
          <p role="status" className="my-4 text-sm">
            Se este e-mail estiver cadastrado, você vai receber um link para criar uma senha nova. Confira também a caixa de spam.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-suave">Informe seu e-mail. Vamos enviar um link para criar uma senha nova.</p>
            <FormAcao acao={pedirNovaSenha} className="flex flex-col gap-4">
              <Campo rotulo="E-mail">
                <input name="email" type="email" autoComplete="email" required className={classeInput} />
              </Campo>
              <BotaoEnviar pendente="Enviando…" className="w-full">Enviar link</BotaoEnviar>
            </FormAcao>
          </>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-rose">← Voltar para o login</Link>
      </div>
    </main>
  );
}
