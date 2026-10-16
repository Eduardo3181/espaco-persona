import type { Metadata } from "next";
import { EmBreve } from "@/components/em-breve";
import { exigirDono } from "@/lib/sessao";

export const metadata: Metadata = { title: "Comandas" };

export default async function Pagina() {
  await exigirDono();
  return <EmBreve modulo="Comandas" fase={4} />;
}
