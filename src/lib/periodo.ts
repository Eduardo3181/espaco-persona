// Períodos de pagamento de comissões:
//   1ª quinzena: dia 1 a 15, paga no dia 16
//   2ª quinzena: dia 16 ao fim do mês, paga no dia 1 do mês seguinte

import { MESES } from "@/lib/formato";
import { somarDias } from "@/lib/agenda";

export type Periodo = {
  chave: string;      // "2026-10-1" ou "2026-10-2"
  inicio: string;     // "AAAA-MM-DD"
  fim: string;
  pagamento: string;  // dia do pagamento
  rotulo: string;     // "1 a 15 de outubro de 2026"
};

const doisDig = (n: number) => String(n).padStart(2, "0");

function montar(ano: number, mes: number, quinzena: 1 | 2): Periodo {
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const base = `${ano}-${doisDig(mes)}`;
  const inicio = quinzena === 1 ? `${base}-01` : `${base}-16`;
  const fim = quinzena === 1 ? `${base}-15` : `${base}-${ultimoDia}`;
  const pagamento = quinzena === 1 ? `${base}-16` : somarDias(fim, 1);
  const nomeMes = MESES[mes - 1];
  const rotulo = quinzena === 1 ? `1 a 15 de ${nomeMes} de ${ano}` : `16 a ${ultimoDia} de ${nomeMes} de ${ano}`;
  return { chave: `${base}-${quinzena}`, inicio, fim, pagamento, rotulo };
}

/** Período que contém a data */
export function periodoDaData(data: string): Periodo {
  const [a, m, d] = data.split("-").map(Number);
  return montar(a, m, d <= 15 ? 1 : 2);
}

/** Período a partir da chave "AAAA-MM-1|2" (inválida → null) */
export function periodoDaChave(chave: unknown): Periodo | null {
  if (typeof chave !== "string" || !/^\d{4}-\d{2}-[12]$/.test(chave)) return null;
  const [a, m, q] = chave.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return montar(a, m, q as 1 | 2);
}

export function periodoAnterior(p: Periodo): Periodo {
  return periodoDaData(somarDias(p.inicio, -1));
}

export function periodoSeguinte(p: Periodo): Periodo {
  return periodoDaData(somarDias(p.fim, 1));
}

export const FORMAS_PAGAMENTO_COMISSAO: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};
