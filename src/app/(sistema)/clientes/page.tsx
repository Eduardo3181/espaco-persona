import type { Metadata } from "next";
import { EmBreve } from "@/components/em-breve";
import { exigirEquipe } from "@/lib/sessao";

export const metadata: Metadata = { title: "Clientes" };

export default async function Pagina() {
  await exigirEquipe();
  return <EmBreve modulo="Clientes" fase={2} />;
}
