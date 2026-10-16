import type { Metadata } from "next";
import { EmBreve } from "@/components/em-breve";
import { exigirEquipe } from "@/lib/sessao";

export const metadata: Metadata = { title: "Comissões" };

export default async function Pagina() {
  await exigirEquipe();
  return <EmBreve modulo="Comissões" fase={5} />;
}
