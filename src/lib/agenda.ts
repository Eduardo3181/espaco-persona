// Datas e horários da agenda, sempre no fuso de São Paulo.
// O Brasil não tem horário de verão desde 2019: o fuso é fixo em -03:00.

export const HORA_ABRE = 8;
export const HORA_FECHA = 20;
export const SLOT_MIN = 30;
export const FUSO = "-03:00";

export type StatusAgendamento = "aguardando" | "confirmado" | "em_atendimento" | "concluido" | "cancelado" | "faltou";

export const STATUS: Record<StatusAgendamento, { rotulo: string; fundo: string; texto: string; borda: string }> = {
  aguardando: { rotulo: "Aguardando confirmação", fundo: "bg-aguardando-fundo", texto: "text-aguardando", borda: "border-aguardando" },
  confirmado: { rotulo: "Confirmado", fundo: "bg-agendado-fundo", texto: "text-agendado", borda: "border-agendado" },
  em_atendimento: { rotulo: "Em atendimento", fundo: "bg-atendimento-fundo", texto: "text-atendimento", borda: "border-atendimento" },
  concluido: { rotulo: "Concluído", fundo: "bg-concluido-fundo", texto: "text-suave", borda: "border-concluido" },
  cancelado: { rotulo: "Cancelou", fundo: "bg-concluido-fundo", texto: "text-erro", borda: "border-erro" },
  faltou: { rotulo: "Faltou", fundo: "bg-concluido-fundo", texto: "text-erro", borda: "border-erro" },
};

/** "2026-10-16" + "14:30" → "2026-10-16T14:30:00-03:00" */
export function paraTimestamp(data: string, hora: string): string {
  return `${data}T${hora}:00${FUSO}`;
}

const partes = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Timestamp do banco → data "AAAA-MM-DD", hora "HH:MM" e minutos desde 00:00 (em São Paulo) */
export function partesSP(valor: string | Date) {
  const p = Object.fromEntries(partes.formatToParts(new Date(valor)).map((x) => [x.type, x.value]));
  const hora = `${p.hour}:${p.minute}`;
  return { data: `${p.year}-${p.month}-${p.day}`, hora, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

/** Soma dias a uma data "AAAA-MM-DD" */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

export const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const DIAS_CURTOS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** "2026-10-16" → "sexta-feira, 16 de outubro" */
export function dataPorExtenso(data: string, comAno = false): string {
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [a, m, d] = data.split("-").map(Number);
  return `${DIAS_SEMANA[diaDaSemana(data)]}, ${d} de ${meses[m - 1]}${comAno ? ` de ${a}` : ""}`;
}

export function dataValida(data: unknown): data is string {
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(`${data}T12:00:00Z`));
}

/** Horários da grade: "08:00", "08:30", … "19:30" */
export function horariosDaGrade(): string[] {
  const lista: string[] = [];
  for (let m = HORA_ABRE * 60; m < HORA_FECHA * 60; m += SLOT_MIN) {
    lista.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return lista;
}
