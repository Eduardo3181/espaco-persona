// Formatação no padrão brasileiro. Dinheiro sempre em centavos (inteiro).

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 12345 → "R$ 123,45" */
export function formatarReais(centavos: number): string {
  return moeda.format(centavos / 100);
}

/** 12345 → "123,45" (para preencher campos de formulário) */
export function centavosParaCampo(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Converte o que a pessoa digitou em centavos.
 * Aceita "120", "120,50", "R$ 1.234,56" e "1234.56". Retorna null se for inválido.
 */
export function reaisParaCentavos(texto: string): number | null {
  let s = texto.replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}$/.test(s) || (s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** "40" ou "37,5" → 40 / 37.5. Vazio → null. Inválido → NaN. */
export function lerPercentual(texto: string): number | null {
  const s = texto.replace(/%|\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return NaN;
  return Math.round(n * 100) / 100;
}

/** 40 → "40%"; 37.5 → "37,5%" */
export function formatarPercentual(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** 90 → "1h30"; 45 → "45 min" */
export function formatarDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** dd/mm/aaaa no fuso de São Paulo */
export function formatarData(valor: string | Date): string {
  return data.format(new Date(valor));
}

/** dd/mm/aaaa hh:mm no fuso de São Paulo */
export function formatarDataHora(valor: string | Date): string {
  return dataHora.format(new Date(valor));
}
