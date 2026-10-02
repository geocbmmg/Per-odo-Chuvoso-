import "server-only";
import type { Leitura } from "@/lib/fontes/tipos";
import { naoImplementada } from "@/lib/sources/stub";

/**
 * RainViewer — tiles de radar para sobrepor no MapLibre. STUB da Fase 0.
 * O índice de quadros (https://api.rainviewer.com/public/weather-maps.json)
 * deve ser lido no servidor; o navegador só baixa os tiles.
 */
export const URL_RAINVIEWER_INDICE = "https://api.rainviewer.com/public/weather-maps.json";

export interface QuadroRadar {
  /** ISO 8601 (UTC) do quadro. */
  instante: string;
  /** Modelo de URL raster para o MapLibre ({z}/{x}/{y}). */
  urlTiles: string;
}

export async function obterQuadrosRadar(): Promise<Leitura<QuadroRadar[]>> {
  return naoImplementada("rainviewer-radar");
}
