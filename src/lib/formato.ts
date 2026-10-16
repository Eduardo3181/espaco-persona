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

/** Guarda só os números do telefone. "(11) 98765-4321" → "11987654321". Remove o 55 do Brasil. */
export function normalizarTelefone(texto: string): string {
  let n = texto.replace(/\D/g, "");
  if (n.length >= 12 && n.startsWith("55")) n = n.slice(2);
  return n;
}

/** "11987654321" → "(11) 98765-4321" */
export function formatarTelefone(n: string | null): string {
  if (!n) return "";
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return n;
}

/** Link do WhatsApp com texto opcional */
export function linkWhatsApp(telefone: string, texto?: string): string {
  const base = `https://wa.me/55${telefone}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Aniversário: "12 de março" ou "12 de março de 1988" */
export function formatarAniversario(dia: number | null, mes: number | null, ano?: number | null): string {
  if (!dia || !mes) return "";
  return `${dia} de ${MESES[mes - 1]}${ano ? ` de ${ano}` : ""}`;
}

export { MESES };

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** dd/mm/aaaa no fuso de São Paulo */
export function formatarData(valor: string | Date): string {
  return data.format(new Date(valor));
}

/** Data sem hora do banco ("2026-10-15") → "15/10/2026" (sem conversão de fuso) */
export function formatarDiaISO(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Hoje em São Paulo no formato "2026-10-15" */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** dd/mm/aaaa hh:mm no fuso de São Paulo */
export function formatarDataHora(valor: string | Date): string {
  const p = Object.fromEntries(dataHora.formatToParts(new Date(valor)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}
