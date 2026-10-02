import type { Feature, MultiPolygon, Polygon } from "geojson";
import { areaAssinada, fecharAnel, type Anel } from "./geometria";

/**
 * Máscara de MG: um polígono do tamanho do mundo com o contorno do estado
 * recortado como buraco. Pintada com um véu escuro, destaca MG sem esconder
 * o entorno.
 *
 * Os anéis saem orientados como manda a RFC 7946 (externo anti-horário,
 * buraco horário), seja qual for o sentido em que vieram no arquivo — o
 * geojson-vt do MapLibre reorienta pela estrutura do polígono, mas outros
 * consumidores (e o teste com classifyRings) dependem do sentido.
 */

/** Latitude máxima da projeção Web Mercator. */
const LAT_MAX = 85.051129;

/** Anel do mundo em sentido anti-horário (área positiva). */
export const ANEL_MUNDO: Anel = [
  [-180, -LAT_MAX],
  [180, -LAT_MAX],
  [180, LAT_MAX],
  [-180, LAT_MAX],
  [-180, -LAT_MAX],
];

function orientar(anel: Anel, positivo: boolean): Anel {
  const fechado = fecharAnel(anel);
  const area = areaAssinada(fechado);
  return area > 0 === positivo ? fechado : fechado.slice().reverse();
}

type ContornoMg = Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon;

function poligonosDe(contorno: ContornoMg): Anel[][] {
  const geometria = "geometry" in contorno ? contorno.geometry : contorno;
  if (!geometria) return [];
  if (geometria.type === "Polygon") return [geometria.coordinates];
  if (geometria.type === "MultiPolygon") return geometria.coordinates;
  return [];
}

/**
 * Cria a máscara a partir do contorno de MG (Feature, Polygon ou MultiPolygon).
 * - cada anel externo de MG vira um buraco no polígono do mundo;
 * - um eventual buraco de MG (área fora do estado cercada por ele) vira um
 *   polígono à parte, para continuar escurecido.
 */
export function criarMascaraMg(contorno: ContornoMg): Feature<MultiPolygon, { papel: "mascara-mg" }> {
  const buracos: Anel[] = [];
  const ilhas: Anel[][] = [];
  for (const aneis of poligonosDe(contorno)) {
    const [externo, ...internos] = aneis;
    if (!externo || externo.length < 3) continue;
    buracos.push(orientar(externo, false));
    for (const interno of internos) {
      if (interno.length >= 3) ilhas.push([orientar(interno, true)]);
    }
  }
  return {
    type: "Feature",
    properties: { papel: "mascara-mg" },
    geometry: {
      type: "MultiPolygon",
      coordinates: [[orientar(ANEL_MUNDO, true), ...buracos], ...ilhas],
    },
  };
}

/** Confere se o JSON é um contorno utilizável (Feature/geometria Polygon ou MultiPolygon). */
export function ehContornoMg(valor: unknown): valor is Feature<Polygon | MultiPolygon> {
  if (!valor || typeof valor !== "object") return false;
  const v = valor as { type?: unknown; geometry?: { type?: unknown; coordinates?: unknown } | null };
  if (v.type !== "Feature" || !v.geometry) return false;
  const tipo = v.geometry.type;
  return (tipo === "Polygon" || tipo === "MultiPolygon") && Array.isArray(v.geometry.coordinates);
}
