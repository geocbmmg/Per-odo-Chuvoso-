/**
 * Constantes do mapa da Sala de Situação (MapLibre GL).
 * Coordenadas sempre em [longitude, latitude] (WGS84), como no GeoJSON.
 */

/** [oeste, sul, leste, norte] */
export type Bbox = readonly [number, number, number, number];
/** [[oeste, sul], [leste, norte]] — formato aceito por fitBounds/maxBounds. */
export type Limites = [[number, number], [number, number]];

/** Envelope do contorno oficial de Minas Gerais (public/geo/mg-outline.json). */
export const BBOX_MG: Bbox = [-51.045, -22.912, -39.856, -14.244];

/** Centro e zoom da vista "MG inteiro" do GeoRescue. */
export const CENTRO_MG: [number, number] = [-44.5, -18.5];
export const ZOOM_INICIAL = 6;
export const ZOOM_MINIMO = 4;
/** Os mapas base da Esri vão até o nível 19. */
export const ZOOM_MAXIMO = 19;

/** Clusters de alertas e ações RRD se desfazem acima deste zoom. */
export const ZOOM_MAXIMO_CLUSTER = 10;
export const RAIO_CLUSTER_PX = 42;

/** Rótulos dos COBs (marcadores HTML) somem acima deste zoom. */
export const ZOOM_MAXIMO_ROTULOS_COB = 9;
/** No celular, com o estado inteiro na tela, os rótulos cobririam os agrupamentos. */
export const ZOOM_MINIMO_ROTULOS_COB_CELULAR = 6;

/** Tolerância (px) em volta do toque/clique para achar pontos pequenos. */
export const TOLERANCIA_CLIQUE_PX = 8;

export const URL_CONTORNO_MG = "/geo/mg-outline.json";

export const ROTULO_REGIAO_MAPA = "Mapa de Minas Gerais com limites dos COBs e alertas";

/** Atualização periódica das camadas de pontos (alertas, ações, ocorrências). */
export const INTERVALO_ATUALIZACAO_PADRAO_MS = 5 * 60 * 1000;

/** Expande um bbox em `folga` graus para cada lado, sem passar dos limites do mundo. */
export function expandirBbox(bbox: Bbox, folga: number): Bbox {
  const [o, s, l, n] = bbox;
  return [
    Math.max(-180, o - folga),
    Math.max(-85, s - folga),
    Math.min(180, l + folga),
    Math.min(85, n + folga),
  ];
}

export function bboxParaLimites(bbox: Bbox): Limites {
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
  ];
}

/** Vista "MG inteiro": o estado todo com uma pequena folga. */
export const LIMITES_VISTA_MG: Limites = bboxParaLimites(expandirBbox(BBOX_MG, 0.2));

/** Até onde o usuário pode arrastar o mapa (MG e vizinhança). */
export const LIMITES_NAVEGACAO: Limites = bboxParaLimites(expandirBbox(BBOX_MG, 9));

export interface PaddingVista {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Padding do fitBounds conforme a largura do contêiner. À esquerda fica a
 * barra de ferramentas (34 px no desktop, 44 px no celular).
 */
export function paddingVista(largura: number, altura: number): PaddingVista {
  const celular = largura < 768;
  const base = celular ? 10 : 28;
  const esquerda = celular ? 62 : 56;
  // Nunca deixa o padding consumir a área útil em contêineres muito pequenos.
  const maxHorizontal = Math.max(0, Math.floor(largura / 2) - 40);
  const maxVertical = Math.max(0, Math.floor(altura / 2) - 40);
  return {
    top: Math.min(base, maxVertical),
    bottom: Math.min(base, maxVertical),
    left: Math.min(esquerda, maxHorizontal),
    right: Math.min(base, maxHorizontal),
  };
}
