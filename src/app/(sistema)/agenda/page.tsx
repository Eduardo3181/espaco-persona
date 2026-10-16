import type { Metadata } from "next";
import { EmBreve } from "@/components/em-breve";
import { exigirEquipe } from "@/lib/sessao";

export const metadata: Metadata = { title: "Agenda" };

export default async function Pagina() {
  await exigirEquipe();
  return <EmBreve modulo="Agenda" fase={3} />;
}
