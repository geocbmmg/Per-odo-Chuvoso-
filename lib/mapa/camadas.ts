import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import { camadasBase, CATALOGO_BASES, fontesBase, type BaseMapaId } from "./bases";
import { RAIO_CLUSTER_PX, ZOOM_MAXIMO_CLUSTER } from "./constantes";
import { expressaoCorCob } from "./cores-cob";
import { criarMascaraMg } from "./mascara";
import {
  ANEL_OCORRENCIA,
  COR_ACAO_RRD,
  COR_ALERTA,
  COR_OCORRENCIA,
  COR_OCORRENCIA_FINALIZADA,
  SIMBOLOS,
} from "./simbologia";
import { PALETAS_MAPA, type TemaMapa } from "./tema";

/**
 * Estilo completo do mapa da Sala de Situação, gerado por uma função pura a
 * partir do estado da tela (mapa base, tema, camadas visíveis e dados).
 *
 * O componente aplica o resultado com `map.setStyle(estilo, { diff: true })`:
 * o MapLibre compara com o estilo atual e executa só o necessário (trocar
 * cores no tema, trocar a fonte raster no mapa base, `setData` quando chegam
 * dados), sem recriar o mapa. Por isso o estilo nunca tem chaves com valor
 * `undefined` e as fontes/camadas mantêm sempre os mesmos ids.
 *
 * Sem "glyphs" e sem "sprite" (nada remoto além dos tiles) e, portanto, sem
 * camadas `symbol`: rótulos e contagens são marcadores HTML.
 */

export const FONTE_MASCARA = "mg-mascara";
export const FONTE_CONTORNO_MG = "mg-contorno";

/** A fonte de cada camada tem o mesmo id da camada ("cobs", "alertas"…). */
export const FONTES_CAMADAS: Record<CamadaMapaId, string> = {
  cobs: "cobs",
  alertas: "alertas",
  "acoes-rrd": "acoes-rrd",
  "ocorrencias-complexas": "ocorrencias-complexas",
};

export const ID_CAMADAS = {
  mascara: "mg-mascara",
  contornoMg: "mg-contorno",
  cobsPreenchimento: "cobs-preenchimento",
  cobsContorno: "cobs-contorno",
  acoesCluster: "acoes-rrd-cluster",
  acoesPonto: "acoes-rrd-ponto",
  alertasCluster: "alertas-cluster",
  alertasPonto: "alertas-ponto",
  ocorrenciasAnel: "ocorrencias-complexas-anel",
  ocorrenciasPonto: "ocorrencias-complexas-ponto",
} as const;

/** Camadas de estilo que pertencem a cada camada lógica (para visibilidade e cliques). */
export const CAMADAS_DE_ESTILO: Record<CamadaMapaId, readonly string[]> = {
  cobs: [ID_CAMADAS.cobsPreenchimento, ID_CAMADAS.cobsContorno],
  alertas: [ID_CAMADAS.alertasCluster, ID_CAMADAS.alertasPonto],
  "acoes-rrd": [ID_CAMADAS.acoesCluster, ID_CAMADAS.acoesPonto],
  "ocorrencias-complexas": [ID_CAMADAS.ocorrenciasAnel, ID_CAMADAS.ocorrenciasPonto],
};

/** Camadas clicáveis de pontos, da mais importante para a menos importante. */
export const CAMADAS_CLICAVEIS_PONTOS: readonly string[] = [
  ID_CAMADAS.ocorrenciasPonto,
  ID_CAMADAS.ocorrenciasAnel,
  ID_CAMADAS.alertasPonto,
  ID_CAMADAS.alertasCluster,
  ID_CAMADAS.acoesPonto,
  ID_CAMADAS.acoesCluster,
];

/** Camada lógica a que pertence uma camada de estilo (ou null se for do mapa base/MG). */
export function camadaLogicaDoEstilo(idEstilo: string): CamadaMapaId | null {
  for (const [camada, ids] of Object.entries(CAMADAS_DE_ESTILO) as [CamadaMapaId, readonly string[]][]) {
    if (ids.includes(idEstilo)) return camada;
  }
  return null;
}

/** Fontes agrupadas em clusters quando o zoom é baixo. */
export const FONTES_COM_CLUSTER: readonly CamadaMapaId[] = ["alertas", "acoes-rrd"];

/** Coleção vazia compartilhada (o MapLibre clona o estilo; nunca é alterada). */
export const COLECAO_VAZIA: FeatureCollection = { type: "FeatureCollection", features: [] };

const ATRIBUICAO_CBMMG = "Dados: CBMMG";

export interface OpcoesEstiloMapa {
  base: BaseMapaId;
  tema: TemaMapa;
  /** Camadas lógicas visíveis. */
  visiveis: Iterable<CamadaMapaId>;
  /** Dados já filtrados (só feições com geometria). Camada ausente = vazia. */
  dados: Partial<Record<CamadaMapaId, FeatureCollection>>;
  /** Contorno de MG (public/geo/mg-outline.json); null enquanto carrega. */
  contornoMg: Feature<Polygon | MultiPolygon> | null;
  reduzirMovimento?: boolean;
}

const cacheMascara = new WeakMap<object, Feature<MultiPolygon>>();

function mascaraDe(contorno: Feature<Polygon | MultiPolygon> | null): GeoJSONSourceSpecification["data"] {
  if (!contorno) return COLECAO_VAZIA;
  let mascara = cacheMascara.get(contorno);
  if (!mascara) {
    mascara = criarMascaraMg(contorno);
    cacheMascara.set(contorno, mascara);
  }
  return mascara;
}

function visibilidade(visivel: boolean): "visible" | "none" {
  return visivel ? "visible" : "none";
}

/** Raio do círculo de cluster proporcional à quantidade de pontos agrupados. */
export function expressaoRaioCluster(raioMinimo: number): ExpressionSpecification {
  return ["step", ["get", "point_count"], raioMinimo, 10, raioMinimo + 4, 50, raioMinimo + 8, 200, raioMinimo + 12];
}

const SEM_CLUSTER: ExpressionSpecification = ["!", ["has", "point_count"]];
const EH_CLUSTER: ExpressionSpecification = ["has", "point_count"];

/**
 * Deslocamento (px, na tela) dos agrupamentos de ações RRD: alertas e ações
 * do mesmo município formariam círculos concêntricos com os números um
 * sobre o outro. O de ações fica um pouco abaixo e à esquerda.
 */
export const DESLOCAMENTO_CLUSTER_ACOES: [number, number] = [-11, 9];

function camadasCluster(
  id: string,
  fonte: string,
  cor: string,
  corHalo: string,
  raioMinimo: number,
  visivel: boolean,
  deslocamento: [number, number] = [0, 0],
): CircleLayerSpecification {
  return {
    id,
    type: "circle",
    source: fonte,
    filter: EH_CLUSTER,
    layout: { visibility: visibilidade(visivel) },
    paint: {
      "circle-color": cor,
      "circle-radius": expressaoRaioCluster(raioMinimo),
      // Halo translúcido = segundo sinal de "agrupamento" (além do número).
      "circle-stroke-color": corHalo,
      "circle-stroke-width": 5,
      "circle-opacity": 0.95,
      "circle-translate": deslocamento,
      "circle-translate-anchor": "viewport",
    },
  };
}

/** Deslocamento (px) do número de cada fonte com agrupamento. */
export const DESLOCAMENTO_CLUSTER: Partial<Record<CamadaMapaId, [number, number]>> = {
  "acoes-rrd": DESLOCAMENTO_CLUSTER_ACOES,
};

function fonteGeoJSON(
  dados: FeatureCollection | undefined,
  extra: Partial<GeoJSONSourceSpecification> = {},
): GeoJSONSourceSpecification {
  return { type: "geojson", data: dados ?? COLECAO_VAZIA, attribution: ATRIBUICAO_CBMMG, ...extra };
}

/** Monta o estilo completo (version 8, sem glyphs/sprite). */
export function montarEstiloMapa(opcoes: OpcoesEstiloMapa): StyleSpecification {
  const { base, tema, dados, contornoMg, reduzirMovimento = false } = opcoes;
  const paleta = PALETAS_MAPA[tema];
  const visiveis = new Set(opcoes.visiveis);
  const ver = (camada: CamadaMapaId) => visiveis.has(camada);

  const sources: Record<string, SourceSpecification> = {
    ...fontesBase(base),
    [FONTE_MASCARA]: { type: "geojson", data: mascaraDe(contornoMg) },
    [FONTE_CONTORNO_MG]: { type: "geojson", data: contornoMg ?? COLECAO_VAZIA },
    [FONTES_CAMADAS.cobs]: fonteGeoJSON(dados.cobs, { promoteId: "cob" }),
    [FONTES_CAMADAS["acoes-rrd"]]: fonteGeoJSON(dados["acoes-rrd"], {
      cluster: true,
      clusterRadius: RAIO_CLUSTER_PX,
      clusterMaxZoom: ZOOM_MAXIMO_CLUSTER,
    }),
    [FONTES_CAMADAS.alertas]: fonteGeoJSON(dados.alertas, {
      cluster: true,
      clusterRadius: RAIO_CLUSTER_PX,
      clusterMaxZoom: ZOOM_MAXIMO_CLUSTER,
    }),
    [FONTES_CAMADAS["ocorrencias-complexas"]]: fonteGeoJSON(dados["ocorrencias-complexas"]),
  };

  const alerta = SIMBOLOS.alertas;
  const acao = SIMBOLOS["acoes-rrd"];
  const ocorrencia = SIMBOLOS["ocorrencias-complexas"];
  const finalizada: ExpressionSpecification = ["==", ["get", "situacao"], "finalizada"];

  const layers: LayerSpecification[] = [
    ...camadasBase(base, tema, { reduzirMovimento }),
    {
      id: ID_CAMADAS.mascara,
      type: "fill",
      source: FONTE_MASCARA,
      paint: { "fill-color": paleta.mascara, "fill-opacity": paleta.opacidadeMascara, "fill-antialias": false },
    },
    {
      id: ID_CAMADAS.cobsPreenchimento,
      type: "fill",
      source: FONTES_CAMADAS.cobs,
      layout: { visibility: visibilidade(ver("cobs")) },
      paint: {
        "fill-color": expressaoCorCob(tema, "preenchimento"),
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selecionado"], false],
          paleta.opacidadeCobSelecionado,
          paleta.opacidadeCob,
        ],
      },
    },
    {
      id: ID_CAMADAS.cobsContorno,
      type: "line",
      source: FONTES_CAMADAS.cobs,
      layout: { visibility: visibilidade(ver("cobs")), "line-join": "round" },
      paint: {
        "line-color": expressaoCorCob(tema, "contorno"),
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selecionado"], false],
          paleta.larguraContornoCob + 1.2,
          paleta.larguraContornoCob,
        ],
      },
    },
    {
      id: ID_CAMADAS.contornoMg,
      type: "line",
      source: FONTE_CONTORNO_MG,
      layout: { "line-join": "round" },
      paint: {
        "line-color": paleta.contornoMg,
        "line-width": paleta.larguraContornoMg,
        "line-opacity": paleta.opacidadeContornoMg,
      },
    },
    // Ações RRD por baixo dos alertas (são mais numerosas e menos urgentes).
    camadasCluster(
      ID_CAMADAS.acoesCluster,
      FONTES_CAMADAS["acoes-rrd"],
      COR_ACAO_RRD,
      "rgba(67, 198, 124, 0.35)",
      11,
      ver("acoes-rrd"),
      DESLOCAMENTO_CLUSTER_ACOES,
    ),
    {
      id: ID_CAMADAS.acoesPonto,
      type: "circle",
      source: FONTES_CAMADAS["acoes-rrd"],
      filter: SEM_CLUSTER,
      layout: { visibility: visibilidade(ver("acoes-rrd")) },
      paint: {
        "circle-color": acao.cor,
        "circle-radius": acao.raio,
        "circle-stroke-color": paleta.contornoPonto,
        "circle-stroke-width": acao.larguraContorno,
      },
    },
    camadasCluster(
      ID_CAMADAS.alertasCluster,
      FONTES_CAMADAS.alertas,
      COR_ALERTA,
      "rgba(255, 138, 69, 0.35)",
      13,
      ver("alertas"),
    ),
    {
      id: ID_CAMADAS.alertasPonto,
      type: "circle",
      source: FONTES_CAMADAS.alertas,
      filter: SEM_CLUSTER,
      layout: { visibility: visibilidade(ver("alertas")) },
      paint: {
        "circle-color": alerta.cor,
        "circle-radius": alerta.raio,
        "circle-stroke-color": paleta.contornoPonto,
        "circle-stroke-width": alerta.larguraContorno,
      },
    },
    // Ocorrência complexa = "alvo": anel externo + miolo. Finalizada fica
    // cinza e menor (cor + tamanho), e as ativas são desenhadas por cima.
    {
      id: ID_CAMADAS.ocorrenciasAnel,
      type: "circle",
      source: FONTES_CAMADAS["ocorrencias-complexas"],
      layout: {
        visibility: visibilidade(ver("ocorrencias-complexas")),
        "circle-sort-key": ["case", finalizada, 0, 1],
      },
      paint: {
        "circle-color": COR_OCORRENCIA,
        "circle-opacity": 0,
        "circle-radius": ["case", finalizada, ANEL_OCORRENCIA.finalizada.raio, ANEL_OCORRENCIA.ativa.raio],
        "circle-stroke-color": ["case", finalizada, ANEL_OCORRENCIA.finalizada.cor, ANEL_OCORRENCIA.ativa.cor],
        "circle-stroke-width": ["case", finalizada, ANEL_OCORRENCIA.finalizada.largura, ANEL_OCORRENCIA.ativa.largura],
      },
    },
    {
      id: ID_CAMADAS.ocorrenciasPonto,
      type: "circle",
      source: FONTES_CAMADAS["ocorrencias-complexas"],
      layout: {
        visibility: visibilidade(ver("ocorrencias-complexas")),
        "circle-sort-key": ["case", finalizada, 0, 1],
      },
      paint: {
        "circle-color": ["case", finalizada, COR_OCORRENCIA_FINALIZADA, ocorrencia.cor],
        "circle-radius": ["case", finalizada, ocorrencia.raio - 1.5, ocorrencia.raio],
        "circle-stroke-color": paleta.contornoPonto,
        "circle-stroke-width": ocorrencia.larguraContorno,
      },
    },
  ];

  return {
    version: 8,
    name: `Sala de Situação · ${CATALOGO_BASES[base].rotulo}`,
    sources,
    layers,
  };
}
