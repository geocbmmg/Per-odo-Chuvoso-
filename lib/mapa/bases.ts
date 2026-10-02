import type { LayerSpecification, RasterSourceSpecification, StyleSpecification } from "maplibre-gl";
import { PALETAS_MAPA, type TemaMapa } from "./tema";

/**
 * Catálogo de mapas base — o mesmo do GeoRescue (_CEN_BASES, Index.html
 * 17087-17092). Tiles raster da Esri no esquema {z}/{y}/{x} (linha antes da
 * coluna, ao contrário do XYZ comum), 256 px, até o nível 19.
 */

export const BASES_MAPA = ["satelite", "hibrido", "ruas", "relevo"] as const;
export type BaseMapaId = (typeof BASES_MAPA)[number];

export const BASE_PADRAO: BaseMapaId = "satelite";

/** Ícone sugerido (o componente traduz para lucide-react). */
export type IconeBase = "terra" | "globo" | "placa" | "triangulo";

export interface CamadaRasterBase {
  /** Modelo de URL do tile com {z}/{y}/{x}. */
  url: string;
  atribuicao: string;
}

export interface DefinicaoBase {
  id: BaseMapaId;
  rotulo: string;
  icone: IconeBase;
  /** De baixo para cima. */
  camadas: readonly CamadaRasterBase[];
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/** URL de tile da Esri para um serviço (ex.: "World_Imagery", "Reference/World_Boundaries_and_Places"). */
export function urlTileEsri(servico: string): string {
  return `${ESRI}/${servico}/MapServer/tile/{z}/{y}/{x}`;
}

const POWERED_BY_ESRI = 'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>';

/** Atribuições oficiais (copyrightText) de cada serviço da Esri. Texto fixo, nunca dado externo. */
const ATRIBUICAO = {
  imagem: `${POWERED_BY_ESRI} | Esri, Maxar, Earthstar Geographics, and the GIS User Community`,
  referencia: "Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community",
  ruas:
    `${POWERED_BY_ESRI} | Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, ` +
    "Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, © OpenStreetMap contributors, and the GIS User Community",
  relevo:
    `${POWERED_BY_ESRI} | Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, ` +
    "GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), " +
    "© OpenStreetMap contributors, and the GIS User Community",
} as const;

const IMAGEM: CamadaRasterBase = { url: urlTileEsri("World_Imagery"), atribuicao: ATRIBUICAO.imagem };

export const CATALOGO_BASES: Record<BaseMapaId, DefinicaoBase> = {
  satelite: { id: "satelite", rotulo: "Satélite", icone: "terra", camadas: [IMAGEM] },
  hibrido: {
    id: "hibrido",
    rotulo: "Satélite + nomes",
    icone: "globo",
    camadas: [
      IMAGEM,
      { url: urlTileEsri("Reference/World_Boundaries_and_Places"), atribuicao: ATRIBUICAO.referencia },
    ],
  },
  ruas: {
    id: "ruas",
    rotulo: "Ruas",
    icone: "placa",
    camadas: [{ url: urlTileEsri("World_Street_Map"), atribuicao: ATRIBUICAO.ruas }],
  },
  relevo: {
    id: "relevo",
    rotulo: "Relevo",
    icone: "triangulo",
    camadas: [{ url: urlTileEsri("World_Topo_Map"), atribuicao: ATRIBUICAO.relevo }],
  },
};

export function ehBaseMapa(valor: unknown): valor is BaseMapaId {
  return typeof valor === "string" && (BASES_MAPA as readonly string[]).includes(valor);
}

export const ID_CAMADA_FUNDO = "fundo";
/** Fontes e camadas raster do mapa base: "base-0", "base-1"… (de baixo para cima). */
export const PREFIXO_BASE = "base-";

export interface OpcoesBase {
  /** Sem cross-fade dos tiles (prefers-reduced-motion). */
  reduzirMovimento?: boolean;
}

/** Fontes raster do mapa base escolhido. */
export function fontesBase(base: BaseMapaId): Record<string, RasterSourceSpecification> {
  const fontes: Record<string, RasterSourceSpecification> = {};
  CATALOGO_BASES[base].camadas.forEach((camada, i) => {
    fontes[`${PREFIXO_BASE}${i}`] = {
      type: "raster",
      tiles: [camada.url],
      tileSize: 256,
      maxzoom: 19,
      attribution: camada.atribuicao,
    };
  });
  return fontes;
}

/** Camada de fundo (cor do tema) + camadas raster do mapa base. */
export function camadasBase(base: BaseMapaId, tema: TemaMapa, opcoes: OpcoesBase = {}): LayerSpecification[] {
  const camadas: LayerSpecification[] = [
    { id: ID_CAMADA_FUNDO, type: "background", paint: { "background-color": PALETAS_MAPA[tema].fundo } },
  ];
  CATALOGO_BASES[base].camadas.forEach((_, i) => {
    camadas.push({
      id: `${PREFIXO_BASE}${i}`,
      type: "raster",
      source: `${PREFIXO_BASE}${i}`,
      paint: { "raster-fade-duration": opcoes.reduzirMovimento ? 0 : 300 },
    });
  });
  return camadas;
}

/**
 * Estilo MapLibre (version 8) só com o mapa base. Sem "glyphs" e sem "sprite":
 * nada de recursos remotos além dos tiles, então o mapa abre mesmo offline
 * (com o fundo na cor do tema).
 */
export function criarEstiloBase(base: BaseMapaId, tema: TemaMapa, opcoes: OpcoesBase = {}): StyleSpecification {
  return {
    version: 8,
    name: `Sala de Situação · ${CATALOGO_BASES[base].rotulo}`,
    sources: { ...fontesBase(base) },
    layers: camadasBase(base, tema, opcoes),
  };
}
