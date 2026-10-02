import type { CamadaMapaId } from "@/lib/dominio/tipos";

/**
 * Simbologia das camadas — "dois sinais, nunca só a cor": cada camada pontual
 * tem cor E forma/tamanho próprios, e a legenda repete a palavra.
 */

export type CamadaPontual = Exclude<CamadaMapaId, "cobs">;

export const CAMADAS_PONTUAIS: readonly CamadaPontual[] = ["alertas", "acoes-rrd", "ocorrencias-complexas"];

export function ehCamadaPontual(camada: CamadaMapaId): camada is CamadaPontual {
  return camada !== "cobs";
}

/** Nome da camada no painel e na legenda. */
export const ROTULOS_CAMADAS: Record<CamadaMapaId, string> = {
  cobs: "Limites dos COBs",
  alertas: "Alertas",
  "acoes-rrd": "Ações RRD",
  "ocorrencias-complexas": "Ocorrências complexas",
};

/** Nome de UM registro (cabeçalho do balão). */
export const ROTULOS_SINGULAR: Record<CamadaMapaId, string> = {
  cobs: "COB",
  alertas: "Alerta",
  "acoes-rrd": "Ação RRD",
  "ocorrencias-complexas": "Ocorrência complexa",
};

/** Forma usada na legenda (o mapa desenha o equivalente com círculos). */
export type FormaSimbolo =
  | "circulo"
  | "circulo-pequeno"
  | "alvo"
  | "alvo-apagado"
  | "agrupamento"
  | "agrupamento-anel";

export interface SimboloPonto {
  rotulo: string;
  forma: FormaSimbolo;
  cor: string;
  /** Raio do círculo principal, em px. */
  raio: number;
  /** Cor do contorno do círculo. */
  contorno: string;
  larguraContorno: number;
}

export const COR_ALERTA = "#FF8A45";
export const COR_ACAO_RRD = "#43C67C";
export const COR_OCORRENCIA = "#E11D48";
export const COR_OCORRENCIA_FINALIZADA = "#868F9C";
/** Contorno escuro dos pontos (legível sobre satélite e sobre o mapa de ruas). */
export const COR_CONTORNO_PONTO = "#0A0E14";

export const SIMBOLOS: Record<CamadaPontual, SimboloPonto> = {
  alertas: {
    rotulo: "Alerta",
    forma: "circulo",
    cor: COR_ALERTA,
    raio: 7.5,
    contorno: COR_CONTORNO_PONTO,
    larguraContorno: 2,
  },
  "acoes-rrd": {
    rotulo: "Ação RRD",
    forma: "circulo-pequeno",
    cor: COR_ACAO_RRD,
    raio: 5,
    contorno: COR_CONTORNO_PONTO,
    larguraContorno: 1.5,
  },
  "ocorrencias-complexas": {
    rotulo: "Ocorrência complexa",
    forma: "alvo",
    cor: COR_OCORRENCIA,
    raio: 6.5,
    contorno: COR_CONTORNO_PONTO,
    larguraContorno: 1.5,
  },
};

/** Camadas cujos pontos se agrupam (clusters) em zoom baixo. */
export type CamadaComAgrupamento = "alertas" | "acoes-rrd";

/** Agrupamento (cluster) no mapa e na legenda. */
export interface SimboloAgrupamento {
  rotulo: string;
  forma: Extract<FormaSimbolo, "agrupamento" | "agrupamento-anel">;
  /** Cor da camada (amostra da legenda). */
  cor: string;
  /** Miolo do círculo. */
  preenchimento: string;
  /** Traço em volta do miolo. */
  contorno: string;
  larguraContorno: number;
  /** Raio (px) com menos de 10 pontos; cresce com a quantidade. */
  raioMinimo: number;
}

/**
 * Agrupamentos com FORMA distinta, não só cor: alertas = disco cheio com halo
 * translúcido; ações RRD = anel (miolo escuro, traço cheio, número claro).
 */
export const AGRUPAMENTOS: Record<CamadaComAgrupamento, SimboloAgrupamento> = {
  alertas: {
    rotulo: "Agrupamento de alertas",
    forma: "agrupamento",
    cor: COR_ALERTA,
    preenchimento: COR_ALERTA,
    contorno: "rgba(255, 138, 69, 0.35)",
    larguraContorno: 5,
    raioMinimo: 13,
  },
  "acoes-rrd": {
    rotulo: "Agrupamento de ações RRD",
    forma: "agrupamento-anel",
    cor: COR_ACAO_RRD,
    preenchimento: COR_CONTORNO_PONTO,
    contorno: COR_ACAO_RRD,
    larguraContorno: 3,
    raioMinimo: 11,
  },
};

/** Anel externo da ocorrência complexa (raio e traço), ativa e finalizada. */
export const ANEL_OCORRENCIA = {
  ativa: { raio: 12.5, largura: 2.5, cor: COR_OCORRENCIA },
  finalizada: { raio: 10, largura: 1.5, cor: COR_OCORRENCIA_FINALIZADA },
} as const;
