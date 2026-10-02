/**
 * Utilitários de data/hora. Toda exibição usa o fuso America/Sao_Paulo,
 * independentemente do fuso do servidor (o Vercel roda em UTC).
 */

export const FUSO_PADRAO = "America/Sao_Paulo";

/** Brasília não tem horário de verão desde 2019: offset fixo de -03:00. */
const OFFSET_BRASILIA = "-03:00";

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PADRAO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const formatoData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PADRAO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatoDiaSemana = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PADRAO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

type EntradaData = Date | string | number;

function paraDate(valor: EntradaData): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

function valida(data: Date): boolean {
  return !Number.isNaN(data.getTime());
}

/** "14:35" no horário de Brasília. Retorna "--:--" para datas inválidas. */
export function formatarHora(valor: EntradaData): string {
  const data = paraDate(valor);
  return valida(data) ? formatoHora.format(data) : "--:--";
}

/** "02/10/2026" no horário de Brasília. */
export function formatarData(valor: EntradaData): string {
  const data = paraDate(valor);
  return valida(data) ? formatoData.format(data) : "--/--/----";
}

/** "02/10/2026 14:35" no horário de Brasília. */
export function formatarDataHora(valor: EntradaData): string {
  const data = paraDate(valor);
  return valida(data) ? `${formatoData.format(data)} ${formatoHora.format(data)}` : "—";
}

/** "qui., 02/10" no horário de Brasília. */
export function formatarDiaSemana(valor: EntradaData): string {
  const data = paraDate(valor);
  return valida(data) ? formatoDiaSemana.format(data) : "—";
}

/**
 * Interpreta data/hora "de parede" de Brasília sem offset, nos formatos usados
 * pelas fontes oficiais: "2026-10-02 10:00:00.0", "2026-10-02 10:00:00",
 * "2026-10-02T10:00", "02/10/2026 10:00". Retorna null se não reconhecer.
 */
export function interpretarDataHoraBrasilia(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const limpo = texto.trim();

  const iso = limpo.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/,
  );
  if (iso) {
    const [, a, m, d, h, min, s = "00"] = iso;
    const data = new Date(`${a}-${m}-${d}T${h}:${min}:${s}${OFFSET_BRASILIA}`);
    return valida(data) ? data : null;
  }

  const br = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, a, h = "00", min = "00", s = "00"] = br;
    const data = new Date(`${a}-${m}-${d}T${h}:${min}:${s}${OFFSET_BRASILIA}`);
    return valida(data) ? data : null;
  }

  // Strings com offset/Z explícito (ISO completo, RFC 2822) o Date entende sozinho.
  if (/(Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(limpo)) {
    const data = new Date(limpo);
    return valida(data) ? data : null;
  }

  return null;
}

/** Idade em segundos de um instante ISO em relação a `agora`. */
export function idadeEmSegundos(iso: string, agora: Date = new Date()): number {
  return Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 1000));
}

/** "há 3 min", "há 2 h", "agora". */
export function formatarIdade(segundos: number): string {
  if (segundos < 60) return "agora";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} dias`;
}
