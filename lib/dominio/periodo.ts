import type { Periodo } from "./tipos";

/**
 * Período chuvoso do CBMMG: de 1º de outubro a 31 de março (horário de Brasília).
 * "atual" é a temporada vigente; fora dela (abril a setembro), é a próxima a começar
 * em outubro — por isso, entre abril e setembro, "anterior" é a mais útil para consulta.
 */
export const PERIODOS = ["atual", "anterior", "tudo"] as const;
export type PeriodoId = (typeof PERIODOS)[number];

export function ehPeriodoId(valor: unknown): valor is PeriodoId {
  return typeof valor === "string" && (PERIODOS as readonly string[]).includes(valor);
}

function anoMesBrasilia(agora: Date): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  return { ano, mes };
}

/** Meia-noite de 1º de outubro do ano informado, em Brasília (03:00 UTC). */
function inicioTemporada(ano: number): string {
  return new Date(`${ano}-10-01T00:00:00-03:00`).toISOString();
}

/** Primeiro instante após 31 de março (1º de abril, 00:00 em Brasília). */
function fimTemporada(anoInicio: number): string {
  return new Date(`${anoInicio + 1}-04-01T00:00:00-03:00`).toISOString();
}

/** Ano em que começou (ou começará, entre abril e setembro) a temporada "atual". */
function anoTemporadaAtual(agora: Date): number {
  const { ano, mes } = anoMesBrasilia(agora);
  return mes <= 3 ? ano - 1 : ano;
}

export function periodoChuvoso(id: PeriodoId, agora: Date = new Date()): Periodo {
  if (id === "tudo") {
    return { id, rotulo: "Todo o histórico", inicio: null, fim: null };
  }
  const anoAtual = anoTemporadaAtual(agora);
  const ano = id === "atual" ? anoAtual : anoAtual - 1;
  return {
    id,
    rotulo: `Período chuvoso ${ano}/${ano + 1}`,
    inicio: inicioTemporada(ano),
    fim: fimTemporada(ano),
  };
}

/** true se o instante ISO está dentro do período (registros sem data só entram em "tudo"). */
export function dentroDoPeriodo(iso: string | null, periodo: Periodo): boolean {
  if (!periodo.inicio && !periodo.fim) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (periodo.inicio && t < new Date(periodo.inicio).getTime()) return false;
  if (periodo.fim && t >= new Date(periodo.fim).getTime()) return false;
  return true;
}
