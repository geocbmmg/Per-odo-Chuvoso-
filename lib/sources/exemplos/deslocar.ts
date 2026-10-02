/**
 * Os dados de exemplo têm datas fixas. No modo demonstração elas são
 * deslocadas para que o instante de referência do arquivo vire "agora",
 * mantendo avisos vigentes e alertas dentro do período chuvoso atual.
 */
export function deslocamentoAte(referenciaIso: string, agora: Date = new Date()): number {
  // Arredondado ao minuto: os horários de exemplo continuam "redondos".
  return Math.round((agora.getTime() - new Date(referenciaIso).getTime()) / 60_000) * 60_000;
}

/**
 * Deslocamento em DIAS inteiros (horário de Brasília): para dados estruturados
 * por dia, como os avisos do INMET (00:00–23:59), que devem continuar "de hoje"
 * a qualquer hora, com os mesmos horários do arquivo.
 */
export function deslocamentoEmDiasAte(referenciaIso: string, agora: Date = new Date()): number {
  const DIA = 86_400_000;
  const BRASILIA = -3 * 3_600_000;
  const diaRef = Math.floor((new Date(referenciaIso).getTime() + BRASILIA) / DIA);
  const diaAgora = Math.floor((agora.getTime() + BRASILIA) / DIA);
  return (diaAgora - diaRef) * DIA;
}

export function deslocarIso(iso: string | null, deslocamentoMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t + deslocamentoMs).toISOString();
}
