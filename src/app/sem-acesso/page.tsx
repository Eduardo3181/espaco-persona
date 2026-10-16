import Image from "next/image";
import { sair } from "@/app/login/actions";
import { classeBotao } from "@/components/ui";

export default function SemAcesso() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-escuro px-4 text-center">
      <Image src="/logo-persona.png" alt="Espaço Persona" width={160} height={160} className="mb-6 h-auto w-36" />
      <div className="max-w-sm rounded-2xl bg-cartao p-6">
        <h1 className="mb-2 font-titulo text-2xl font-bold">Acesso ainda não liberado</h1>
        <p className="mb-6 text-sm text-suave">
          Seu login existe, mas ainda não está ligado a ninguém da equipe. Peça ao dono do salão para cadastrar seu e-mail em Equipe.
        </p>
        <form action={sair}>
          <button className={classeBotao("secundario", "w-full")}>Sair</button>
        </form>
      </div>
    </main>
  );
}
