import type { Geometry, MultiPolygon, Polygon, Position } from "geojson";

/**
 * Geometria plana simples (em graus) para posicionar rótulos e montar a
 * máscara. Suficiente para a escala de um estado: não é geodésica.
 */

export type Anel = Position[];

/** Área assinada pela fórmula do laço (positiva = anti-horário em lon/lat). */
export function areaAssinada(anel: Anel): number {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    soma += (anel[j][0] - anel[i][0]) * (anel[j][1] + anel[i][1]);
  }
  return soma / 2;
}

/** Fecha o anel (último ponto = primeiro), sem alterar o original. */
export function fecharAnel(anel: Anel): Anel {
  if (anel.length === 0) return [];
  const [x0, y0] = anel[0];
  const [xn, yn] = anel[anel.length - 1];
  return x0 === xn && y0 === yn ? anel.slice() : [...anel, anel[0]];
}

/** Ponto dentro de um anel (ray casting). */
function dentroDoAnel(ponto: Position, anel: Anel): boolean {
  const [x, y] = ponto;
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Ponto dentro de um polígono (anel externo menos os buracos). */
export function pontoNoPoligono(ponto: Position, aneis: Anel[]): boolean {
  if (aneis.length === 0 || !dentroDoAnel(ponto, aneis[0])) return false;
  for (let i = 1; i < aneis.length; i++) {
    if (dentroDoAnel(ponto, aneis[i])) return false;
  }
  return true;
}

/** Centroide de área do polígono (descontando buracos); null se degenerado. */
export function centroidePoligono(aneis: Anel[]): Position | null {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const sinalExterno = Math.sign(areaAssinada(aneis[0])) || 1;
  aneis.forEach((anel, indice) => {
    // Buracos sempre descontam área, qualquer que seja o sentido em que vieram.
    const sinal = indice === 0 ? 1 : Math.sign(areaAssinada(anel)) === sinalExterno ? -1 : 1;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [x0, y0] = anel[j];
      const [x1, y1] = anel[i];
      const f = (x0 * y1 - x1 * y0) * sinal;
      area += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
  });
  if (Math.abs(area) < 1e-12) return null;
  return [cx / (3 * area), cy / (3 * area)];
}

/**
 * Trecho interno mais largo em que a latitude `y` corta o polígono: devolve o
 * meio do trecho e a largura. Usado quando o centroide cai fora (polígonos
 * côncavos, em "C" ou "U").
 */
function melhorTrechoNaHorizontal(aneis: Anel[], y: number): { ponto: Position; largura: number } | null {
  const cortes: number[] = [];
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i];
      const [xj, yj] = anel[j];
      if (yi > y !== yj > y) cortes.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
  }
  cortes.sort((a, b) => a - b);
  let melhor: { ponto: Position; largura: number } | null = null;
  for (let i = 0; i + 1 < cortes.length; i += 2) {
    const largura = cortes[i + 1] - cortes[i];
    if (!melhor || largura > melhor.largura) {
      melhor = { ponto: [(cortes[i] + cortes[i + 1]) / 2, y], largura };
    }
  }
  return melhor;
}

function envelope(anel: Anel): [number, number, number, number] {
  let o = Infinity;
  let s = Infinity;
  let l = -Infinity;
  let n = -Infinity;
  for (const [x, y] of anel) {
    if (x < o) o = x;
    if (x > l) l = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [o, s, l, n];
}

/** Ponto para rótulo de um polígono: centroide se cair dentro; senão, o melhor ponto interno. */
export function pontoDeRotuloPoligono(aneis: Anel[]): Position | null {
  if (aneis.length === 0 || aneis[0].length < 3) return null;
  const centroide = centroidePoligono(aneis);
  if (centroide && pontoNoPoligono(centroide, aneis)) return centroide;

  // Varre latitudes a partir do centro e fica com o trecho interno mais largo.
  const [, s, , n] = envelope(aneis[0]);
  const yCentral = centroide ? centroide[1] : (s + n) / 2;
  const passos = 24;
  let melhor: { ponto: Position; largura: number } | null = null;
  for (let k = 0; k <= passos; k++) {
    const desloc = (Math.ceil(k / 2) / passos) * (n - s) * (k % 2 === 0 ? 1 : -1);
    const y = Math.min(n, Math.max(s, yCentral + desloc)) + 1e-9;
    const trecho = melhorTrechoNaHorizontal(aneis, y);
    if (trecho && (!melhor || trecho.largura > melhor.largura)) melhor = trecho;
  }
  return melhor ? melhor.ponto : null;
}

/**
 * Ponto para rótulo de um Polygon/MultiPolygon. No MultiPolygon, usa a maior
 * parte (por área). Retorna [lon, lat] ou null para geometria inválida.
 */
export function pontoDeRotulo(geometria: Geometry | null | undefined): [number, number] | null {
  if (!geometria) return null;
  let poligonos: Anel[][];
  if (geometria.type === "Polygon") poligonos = [(geometria as Polygon).coordinates];
  else if (geometria.type === "MultiPolygon") poligonos = (geometria as MultiPolygon).coordinates;
  else return null;

  let maior: Anel[] | null = null;
  let maiorArea = -1;
  for (const aneis of poligonos) {
    if (!aneis[0] || aneis[0].length < 3) continue;
    const area = Math.abs(areaAssinada(aneis[0]));
    if (area > maiorArea) {
      maiorArea = area;
      maior = aneis;
    }
  }
  if (!maior) return null;
  const ponto = pontoDeRotuloPoligono(maior);
  return ponto ? [ponto[0], ponto[1]] : null;
}
