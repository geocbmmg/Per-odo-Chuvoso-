/**
 * Os dados de exemplo têm datas fixas. No modo demonstração elas são
 * deslocadas para que o instante de referência do arquivo vire "agora",
 * mantendo avisos vigentes e alertas dentro do período chuvoso atual.
 */
export function deslocamentoAte(referenciaIso: string, agora: Date = new Date()): number {
  return agora.getTime() - new Date(referenciaIso).getTime();
}

export function deslocarIso(iso: string | null, deslocamentoMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t + deslocamentoMs).toISOString();
}
