// Períodos de comissões: fixos, de 1 a 15 e de 16 ao fim do mês, ou uma faixa
// de datas personalizada. O pagamento sugerido é o próximo dos DOIS dias de
// pagamento (configuráveis) depois que o período termina.
//   Dias [5, 20]:  1 a 15 → paga dia 20;  16 ao fim do mês → paga dia 5

import { MESES } from "@/lib/formato";
import { dataValida, somarDias } from "@/lib/agenda";

export type DiasPagamento = [number, number];
export const DIAS_PADRAO: DiasPagamento = [1, 16];

export type Periodo = {
  chave: string;      // início "AAAA-MM-DD"; personalizado: "AAAA-MM-DD_AAAA-MM-DD"
  inicio: string;
  fim: string;
  pagamento: string;  // dia de pagamento sugerido
  rotulo: string;     // "1 a 15 de outubro de 2026"
  personalizado: boolean;
};

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
  if (ai === af) return `${di} de ${MESES[mi - 1]} a ${df} de ${MESES[mf - 1]} de ${af}`;
  return `${di} de ${MESES[mi - 1]} de ${ai} a ${df} de ${MESES[mf - 1]} de ${af}`;
}

/** Próximo dia de pagamento depois da data */
function proximoPagamento(data: string, dias: DiasPagamento) {
  const [a, m, d] = data.split("-").map(Number);
  if (d < dias[0]) return iso(a, m, dias[0]);
  if (d < dias[1]) return iso(a, m, dias[1]);
  return iso(a, m + 1, dias[0]);
}

function montar(inicio: string, fim: string, dias: DiasPagamento, personalizado = false): Periodo {
  return {
    chave: personalizado ? `${inicio}_${fim}` : inicio, inicio, fim, personalizado,
    pagamento: proximoPagamento(fim, dias), rotulo: rotular(inicio, fim),
  };
}

/** Período fixo que contém a data: 1 a 15 ou 16 ao fim do mês */
export function periodoDaData(data: string, dias: DiasPagamento = DIAS_PADRAO): Periodo {
  const [a, m, d] = data.split("-").map(Number);
  return d <= 15
    ? montar(iso(a, m, 1), iso(a, m, 15), dias)
    : montar(iso(a, m, 16), iso(a, m + 1, 0), dias);
}

/** Faixa escolhida à mão; inválida → null */
export function periodoPersonalizado(de: unknown, ate: unknown, dias: DiasPagamento = DIAS_PADRAO): Periodo | null {
  if (!dataValida(de) || !dataValida(ate) || ate < de) return null;
  return montar(de, ate, dias, true);
}

/** Período a partir da chave; inválida → null */
export function periodoDaChave(chave: unknown, dias: DiasPagamento = DIAS_PADRAO): Periodo | null {
  if (typeof chave !== "string") return null;
  const [de, ate] = chave.split("_");
  if (ate) return periodoPersonalizado(de, ate, dias);
  return dataValida(de) ? periodoDaData(de, dias) : null;
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
