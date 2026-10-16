import { Estrutura } from "@/components/estrutura";
import { exigirEquipe } from "@/lib/sessao";
import { sair } from "@/app/login/actions";

export default async function LayoutSistema({ children }: LayoutProps<"/">) {
  const { profissional } = await exigirEquipe();
  return (
    <Estrutura papel={profissional.papel} nome={profissional.nome} acaoSair={sair}>
      {children}
    </Estrutura>
  );
}
