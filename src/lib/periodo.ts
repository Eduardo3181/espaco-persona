// Períodos de pagamento de comissões, a partir de DOIS dias de pagamento
// no mês (configuráveis; padrão 1 e 16). Cada período vai do dia de
// pagamento até a véspera do próximo, e é pago no dia em que termina + 1.
//   Padrão [1, 16]:  1 a 15 → paga dia 16;  16 ao fim do mês → paga dia 1

import { MESES } from "@/lib/formato";
import { somarDias } from "@/lib/agenda";

export type DiasPagamento = [number, number];
export const DIAS_PADRAO: DiasPagamento = [1, 16];

export type Periodo = {
  chave: string;      // = início do período "AAAA-MM-DD"
  inicio: string;
  fim: string;
  pagamento: string;  // dia do pagamento (dia seguinte ao fim)
  rotulo: string;     // "1 a 15 de outubro de 2026"
};

const doisDig = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.toISOString().slice(0, 10);
};

/** Normaliza o que vem do banco: dois dias distintos entre 1 e 28, em ordem */
export function diasValidos(valor: unknown): DiasPagamento {
  if (Array.isArray(valor) && valor.length === 2) {
    const [a, b] = valor.map(Number);
    if (a >= 1 && b <= 28 && a < b) return [a, b];
  }
  return DIAS_PADRAO;
}

function rotular(inicio: string, fim: string) {
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  if (ai === af && mi === mf) return `${di} a ${df} de ${MESES[mf - 1]} de ${af}`;
  return `${di} de ${MESES[mi - 1]} a ${df} de ${MESES[mf - 1]} de ${af}`;
}

function montar(inicio: string, dias: DiasPagamento): Periodo {
  const [a, m, d] = inicio.split("-").map(Number);
  // próximo dia de pagamento depois do início
  const proximo = d === dias[0] ? iso(a, m, dias[1]) : iso(a, m + 1, dias[0]);
  const fim = somarDias(proximo, -1);
  return { chave: inicio, inicio, fim, pagamento: proximo, rotulo: rotular(inicio, fim) };
}

/** Período que contém a data */
export function periodoDaData(data: string, dias: DiasPagamento = DIAS_PADRAO): Periodo {
  const [a, m, d] = data.split("-").map(Number);
  let inicio: string;
  if (d >= dias[1]) inicio = `${a}-${doisDig(m)}-${doisDig(dias[1])}`;
  else if (d >= dias[0]) inicio = `${a}-${doisDig(m)}-${doisDig(dias[0])}`;
  else inicio = iso(a, m - 1, dias[1]); // antes do 1º dia: período começou no mês anterior
  return montar(inicio, dias);
}

/** Período a partir da chave (data de início); inválida → null */
export function periodoDaChave(chave: unknown, dias: DiasPagamento = DIAS_PADRAO): Periodo | null {
  if (typeof chave !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(chave)) return null;
  return periodoDaData(chave, dias);
}

export function periodoAnterior(p: Periodo, dias: DiasPagamento = DIAS_PADRAO): Periodo {
  return periodoDaData(somarDias(p.inicio, -1), dias);
}

export function periodoSeguinte(p: Periodo, dias: DiasPagamento = DIAS_PADRAO): Periodo {
  return periodoDaData(somarDias(p.fim, 1), dias);
}

export const FORMAS_PAGAMENTO_COMISSAO: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};
