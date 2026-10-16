import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BotaoEnviar, FormAcao } from "@/components/formulario";
import { Campo, classeInput } from "@/components/ui";
import { entrar } from "./actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-escuro px-4 py-10">
      <Image src="/logo-persona.png" alt="Espaço Persona – Hair and Beauty" width={220} height={220} priority className="mb-8 h-auto w-44 sm:w-52" />
      <div className="w-full max-w-sm rounded-2xl bg-cartao p-6 shadow-xl">
        <h1 className="mb-1 font-titulo text-3xl font-bold">Entrar</h1>
        <p className="mb-6 text-sm text-suave">Use o e-mail e a senha cadastrados pelo salão.</p>
        {erro === "link" && (
          <p role="alert" className="mb-4 rounded-lg bg-[#F6E3E3] px-3 py-2 text-sm text-erro">
            O link do e-mail expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.
          </p>
        )}
        <FormAcao acao={entrar} className="flex flex-col gap-4">
          <Campo rotulo="E-mail">
            <input name="email" type="email" autoComplete="email" required className={classeInput} />
          </Campo>
          <Campo rotulo="Senha">
            <input name="senha" type="password" autoComplete="current-password" required className={classeInput} />
          </Campo>
          <BotaoEnviar pendente="Entrando…" className="mt-2 w-full">
            Entrar
          </BotaoEnviar>
        </FormAcao>
        <Link href="/login/esqueci" className="mt-4 flex min-h-11 items-center justify-center text-sm font-semibold text-rose">
          Esqueci minha senha
        </Link>
      </div>
    </main>
  );
}
