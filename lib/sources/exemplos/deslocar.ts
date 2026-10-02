/**
 * Os dados de exemplo têm datas fixas. No modo demonstração elas são
 * deslocadas para que o instante de referência do arquivo vire "agora",
 * mantendo avisos vigentes e alertas dentro do período chuvoso atual.
 */
export function deslocamentoAte(referenciaIso: string, agora: Date = new Date()): number {
  // Arredondado ao minuto: os horários de exemplo continuam "redondos".
  return Math.round((agora.getTime() - new Date(referenciaIso).getTime()) / 60_000) * 60_000;
}

export function deslocarIso(iso: string | null, deslocamentoMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t + deslocamentoMs).toISOString();
}
