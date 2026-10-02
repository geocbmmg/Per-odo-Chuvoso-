import type { MultiPolygon, Point, Polygon, Position } from "geojson";
import type { GeometriaEsri } from "./cliente";

/**
 * Conversão de geometrias Esri JSON (outSR 4326) para GeoJSON (RFC 7946).
 * No Esri, anéis externos são horários e buracos anti-horários, todos numa
 * lista plana `rings`; no GeoJSON cada polígono começa pelo anel externo
 * (anti-horário) seguido dos seus buracos (horários).
 */

function numeroFinito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

export function pontoEsriParaGeoJSON(geometria: GeometriaEsri | null | undefined): Point | null {
  if (!geometria || !("x" in geometria) || !("y" in geometria)) return null;
  const { x, y } = geometria as { x: unknown; y: unknown };
  if (!numeroFinito(x) || !numeroFinito(y)) return null;
  // Survey123 grava 0,0 quando o ponto não é informado.
  if (x === 0 && y === 0) return null;
  if (Math.abs(x) > 180 || Math.abs(y) > 90) return null;
  return { type: "Point", coordinates: [x, y] };
}

/** Área com sinal (fórmula do laço): > 0 anti-horário, < 0 horário. */
export function areaComSinal(anel: Position[]): number {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    soma += (anel[j][0] - anel[i][0]) * (anel[j][1] + anel[i][1]);
  }
  return soma / 2;
}

function pontoNoAnel(ponto: Position, anel: Position[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    const cruza = yi > ponto[1] !== yj > ponto[1] &&
      ponto[0] < ((xj - xi) * (ponto[1] - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function fecharAnel(anel: Position[]): Position[] {
  const primeiro = anel[0];
  const ultimo = anel[anel.length - 1];
  if (primeiro[0] !== ultimo[0] || primeiro[1] !== ultimo[1]) return [...anel, primeiro];
  return anel;
}

function orientar(anel: Position[], antiHorario: boolean): Position[] {
  const ehAntiHorario = areaComSinal(anel) > 0;
  return ehAntiHorario === antiHorario ? anel : [...anel].reverse();
}

export function poligonoEsriParaGeoJSON(
  geometria: GeometriaEsri | null | undefined,
): Polygon | MultiPolygon | null {
  if (!geometria || !("rings" in geometria) || !Array.isArray(geometria.rings)) return null;

  const aneis = (geometria.rings as unknown[])
    .filter((anel): anel is Position[] => Array.isArray(anel))
    .map((anel) =>
      anel
        .filter((p): p is Position => Array.isArray(p) && numeroFinito(p[0]) && numeroFinito(p[1]))
        .map((p) => [p[0], p[1]] as Position),
    )
    .filter((anel) => anel.length >= 3)
    .map(fecharAnel)
    .filter((anel) => anel.length >= 4 && areaComSinal(anel) !== 0);

  if (aneis.length === 0) return null;

  const externos: Position[][] = [];
  const buracos: Position[][] = [];
  for (const anel of aneis) {
    // Esri: horário (área < 0) = externo.
    if (areaComSinal(anel) < 0) externos.push(anel);
    else buracos.push(anel);
  }

  // Dados mal orientados (só anéis anti-horários): trata todos como externos.
  if (externos.length === 0) {
    externos.push(...buracos.splice(0));
  }

  const poligonos: Position[][][] = externos.map((externo) => [orientar(externo, true)]);
  for (const buraco of buracos) {
    const indice = externos.findIndex((externo) => pontoNoAnel(buraco[0], externo));
    if (indice >= 0) poligonos[indice].push(orientar(buraco, false));
  }

  return poligonos.length === 1
    ? { type: "Polygon", coordinates: poligonos[0] }
    : { type: "MultiPolygon", coordinates: poligonos };
}
