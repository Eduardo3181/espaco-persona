"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { classeInput } from "@/components/ui";
import { formatarTelefone } from "@/lib/formato";
import { buscarClientes } from "@/app/(sistema)/agenda/actions";

type ClienteResumo = { id: string; nome: string; telefone: string | null };

/** Campo de busca de cliente que grava o id escolhido em um input escondido. */
export function SeletorCliente({ nome = "cliente_id", inicial = null, obrigatorio = false }: {
  nome?: string;
  inicial?: ClienteResumo | null;
  obrigatorio?: boolean;
}) {
  const [cliente, setCliente] = useState<ClienteResumo | null>(inicial);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);

  useEffect(() => {
    if (cliente || termo.trim().length < 2) return;
    const t = setTimeout(async () => setResultados(await buscarClientes(termo)), 250);
    return () => clearTimeout(t);
  }, [termo, cliente]);

  if (cliente) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-rose-claro bg-agendado-fundo/50 px-3">
        <input type="hidden" name={nome} value={cliente.id} />
        <span className="text-sm">
          <strong>{cliente.nome}</strong>
          {cliente.telefone && <span className="text-suave"> · {formatarTelefone(cliente.telefone)}</span>}
        </span>
        <button type="button" onClick={() => { setCliente(null); setTermo(""); setResultados([]); }}
          className="flex min-h-11 min-w-11 items-center justify-center text-suave hover:text-erro" aria-label="Trocar cliente">
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name={nome} value="" required={obrigatorio} />
      <Search size={18} className="pointer-events-none absolute top-3 left-3 text-suave" aria-hidden />
      <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Digite o nome ou telefone…"
        aria-label="Buscar cliente" autoComplete="off" className={`${classeInput} pl-10`} />
      {termo.trim().length >= 2 && (
        <ul className="mt-1 overflow-hidden rounded-lg border border-borda bg-cartao shadow-lg">
          {resultados.length === 0 && <li className="px-3 py-2 text-sm text-suave">Nenhuma cliente encontrada.</li>}
          {resultados.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setCliente(c)} className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-fundo">
                {c.nome}{c.telefone && <span className="ml-2 text-suave">{formatarTelefone(c.telefone)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
