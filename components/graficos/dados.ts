/**
 * Preparação dos dados dos gráficos da Visão Geral. Módulo puro (sem
 * "use client"): usado pelos gráficos no navegador e pelas tabelas e
 * estimativas de altura no servidor.
 */
import type { SerieId } from "./paleta";

export interface SerieGrafico {
  chave: string;
  rotulo: string;
  serie: SerieId;
}

export interface LinhaAlertasPorCob {
  cob: string;
  alertas: number;
  acoesRrd: number;
  pendentes: number;
}

export interface LinhaAlertasPorTipo {
  tipo: string;
  total: number;
}

/** Séries do gráfico "Alertas por COB" (mesma ordem da legenda e do empilhamento). */
export const SERIES_ALERTAS_POR_COB: readonly SerieGrafico[] = [
  { chave: "atendidos", rotulo: "Com ação RRD", serie: "atendido" },
  { chave: "pendentes", rotulo: "Pendente", serie: "pendente" },
];

/** Alertas com ação RRD = alertas − pendentes (nunca negativo). */
export function alertasAtendidos(linha: Pick<LinhaAlertasPorCob, "alertas" | "pendentes">): number {
  return Math.max(0, linha.alertas - linha.pendentes);
}

/** Acima disto, a cauda vira uma barra "Outros (N tipos)" (a tabela lista todos). */
export const MAX_BARRAS_TIPO = 10;

/** Ordena desc (empate: alfabética) e agrupa a cauda em "Outros". Ignora tipos sem alerta. */
export function agruparTiposRisco(
  linhas: readonly LinhaAlertasPorTipo[],
  maximo = MAX_BARRAS_TIPO,
): LinhaAlertasPorTipo[] {
  const ordenadas = [...linhas]
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, "pt-BR"));
  if (ordenadas.length <= maximo) return ordenadas;
  const visiveis = ordenadas.slice(0, maximo - 1);
  const cauda = ordenadas.slice(maximo - 1);
  return [...visiveis, { tipo: `Outros (${cauda.length} tipos)`, total: cauda.reduce((soma, l) => soma + l.total, 0) }];
}
