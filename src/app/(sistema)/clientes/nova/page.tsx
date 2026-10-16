import type { Metadata } from "next";
import { Cartao } from "@/components/ui";
import { exigirEquipe } from "@/lib/sessao";
import { FormCliente } from "../form-cliente";

export const metadata: Metadata = { title: "Nova cliente" };

export default async function NovaCliente() {
  await exigirEquipe();
  return (
    <Cartao className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold">Nova cliente</h2>
      <FormCliente />
    </Cartao>
  );
}
