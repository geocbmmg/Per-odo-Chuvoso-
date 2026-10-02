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
export type FormaSimbolo = "circulo" | "circulo-pequeno" | "alvo" | "alvo-apagado" | "agrupamento";

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

/** Anel externo da ocorrência complexa (raio e traço), ativa e finalizada. */
export const ANEL_OCORRENCIA = {
  ativa: { raio: 12.5, largura: 2.5, cor: COR_OCORRENCIA },
  finalizada: { raio: 10, largura: 1.5, cor: COR_OCORRENCIA_FINALIZADA },
} as const;
