import { formatarData, formatarHora } from "@/lib/datas";
import type { Periodo } from "@/lib/dominio/tipos";

/** "03/10 18:00" no horário de Brasília (via lib/datas). Null para data ausente/inválida. */
export function formatarDiaMesHora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return `${formatarData(data).slice(0, 5)} ${formatarHora(data)}`;
}

/**
 * "01/10/2026 a 31/03/2027" (o fim do período é exclusivo: 1º/04 00:00 → 31/03).
 * Null para "todo o histórico".
 */
export function intervaloDoPeriodo(periodo: Pick<Periodo, "inicio" | "fim">): string | null {
  if (!periodo.inicio && !periodo.fim) return null;
  const inicio = periodo.inicio ? formatarData(periodo.inicio) : "o início";
  const fim = periodo.fim ? formatarData(new Date(new Date(periodo.fim).getTime() - 1)) : "hoje";
  return `${inicio} a ${fim}`;
}

/** "Período chuvoso 2026/2027 · 01/10/2026 a 31/03/2027" ou "Todo o histórico". */
export function descreverPeriodo(periodo: Pick<Periodo, "rotulo" | "inicio" | "fim">): string {
  const intervalo = intervaloDoPeriodo(periodo);
  return intervalo ? `${periodo.rotulo} · ${intervalo}` : periodo.rotulo;
}

/** Regra de pendência, em uma frase (KPIs, tabela e gráficos). */
export const REGRA_PENDENCIA =
  "Pendente = alerta do período sem nenhuma ação RRD (de qualquer data) com o mesmo nº de chamada CAD; alertas sem nº de chamada contam como pendentes.";
