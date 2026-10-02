import { classificarChuva, type NivelRisco } from "./matrizes";

/**
 * Chuva prevista por município, no modelo do GeoRisk (docs/fase-1.md, seção 6).
 *
 * Cada município tem a série horária da previsão no ponto da sede. A partir
 * dela saem duas janelas, classificadas pela matriz de chuva do CBMMG (o pior
 * entre o critério por hora e o acumulado em 24 h):
 *  - próximas 24 h: maior chuva horária e acumulado das 24 h;
 *  - próximas 72 h: maior chuva horária e PIOR acumulado em 24 h consecutivas
 *    dentro das 72 h (a matriz é de 24 h; somar 72 h inflaria o nível).
 *
 * Puro: sem React, Next ou server-only.
 */

export interface ChuvaMunicipio {
  /** Código IBGE de 7 dígitos. */
  ibge: string;
  /** Maior chuva horária prevista nas próximas 24 h (mm/h). */
  maxHora24h: number | null;
  /** Acumulado previsto nas próximas 24 h (mm). */
  acumulado24h: number | null;
  /** Maior chuva horária prevista nas próximas 72 h (mm/h). */
  maxHora72h: number | null;
  /** Pior acumulado em 24 h consecutivas dentro das próximas 72 h (mm). */
  pior24hEm72h: number | null;
  /** Acumulado previsto nas próximas 72 h (mm), para o balão e o ranking. */
  acumulado72h: number | null;
  /** Nível da matriz nas próximas 24 h. */
  nivel24h: NivelRisco | null;
  /** Nível da matriz nas próximas 72 h. */
  nivel72h: NivelRisco | null;
}

export type JanelaChuva = "24h" | "72h";

export interface ChuvaPorMunicipio {
  /** ISO (UTC) da primeira hora das janelas. */
  inicioJanela: string;
  /** Modelo usado pela fonte (ex.: "best_match"), para o crédito. */
  modelo: string;
  municipios: ChuvaMunicipio[];
}

function arred(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/** Soma; null se faltar qualquer hora (não inventa acumulado). */
function soma(valores: readonly (number | null)[]): number | null {
  if (valores.length === 0 || valores.some((v) => v === null)) return null;
  return arred((valores as number[]).reduce((a, b) => a + b, 0));
}

/** Máximo; null se faltar qualquer hora (um buraco pode esconder o pico). */
function maximo(valores: readonly (number | null)[]): number | null {
  if (valores.length === 0 || valores.some((v) => v === null)) return null;
  return arred(Math.max(...(valores as number[])));
}

/**
 * Resume a série horária (mm por hora, a partir da primeira hora da janela)
 * nas janelas de 24 h e 72 h. Série com menos de 72 horas: a janela de 72 h
 * fica null; com menos de 24, as duas.
 */
export function resumirChuva(ibge: string, horas: readonly (number | null)[]): ChuvaMunicipio {
  const h24 = horas.slice(0, 24);
  const h72 = horas.slice(0, 72);
  const tem24 = h24.length === 24;
  const tem72 = h72.length === 72;

  const maxHora24h = tem24 ? maximo(h24) : null;
  const acumulado24h = tem24 ? soma(h24) : null;
  const maxHora72h = tem72 ? maximo(h72) : null;
  const acumulado72h = tem72 ? soma(h72) : null;

  let pior24hEm72h: number | null = null;
  if (tem72 && h72.every((v) => v !== null)) {
    const valores = h72 as number[];
    let janela = valores.slice(0, 24).reduce((a, b) => a + b, 0);
    let pior = janela;
    for (let i = 24; i < 72; i++) {
      janela += valores[i] - valores[i - 24];
      if (janela > pior) pior = janela;
    }
    pior24hEm72h = arred(pior);
  }

  return {
    ibge,
    maxHora24h,
    acumulado24h,
    maxHora72h,
    pior24hEm72h,
    acumulado72h,
    nivel24h: classificarChuva({ mmHoraMax: maxHora24h, mm24h: acumulado24h }),
    nivel72h: classificarChuva({ mmHoraMax: maxHora72h, mm24h: pior24hEm72h }),
  };
}

/** Nível do município na janela escolhida. */
export function nivelNaJanela(chuva: ChuvaMunicipio, janela: JanelaChuva): NivelRisco | null {
  return janela === "24h" ? chuva.nivel24h : chuva.nivel72h;
}
