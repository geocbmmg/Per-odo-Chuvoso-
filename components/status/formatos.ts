/**
 * Formatação numérica e de durações das telas de status e monitoramento
 * (pt-BR, sempre com separador de milhar/decimal brasileiro). Módulo puro:
 * serve a Server e Client Components.
 */

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "1.234" */
export function formatarInteiro(valor: number): string {
  return inteiro.format(valor);
}

/** "12,3" — milímetros de chuva com uma casa decimal. */
export function formatarMm(valor: number): string {
  return umaCasa.format(valor);
}

/** "1.234 ms" ou "—" quando não houve medição. */
export function formatarLatencia(ms: number | null): string {
  return ms === null ? "—" : `${inteiro.format(ms)} ms`;
}

/** Durações do catálogo de fontes: "2 min", "1 h", "6 h", "1 dia", "7 dias". */
export function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${inteiro.format(segundos)} s`;
  const minutos = segundos / 60;
  if (minutos < 60) return `${inteiro.format(Math.round(minutos))} min`;
  const horas = minutos / 60;
  if (horas < 24 || horas % 24 !== 0) return `${inteiro.format(Math.round(horas))} h`;
  const dias = horas / 24;
  return dias === 1 ? "1 dia" : `${inteiro.format(dias)} dias`;
}

/** Só aceita links http(s) vindos das fontes (evita javascript:, data: etc.). */
export function linkSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
