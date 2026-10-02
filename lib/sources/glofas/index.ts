import "server-only";
import type { Leitura } from "@/lib/fontes/tipos";
import { naoImplementada } from "@/lib/sources/stub";

/**
 * Open-Meteo Flood API (modelo GloFAS/Copernicus) — vazão prevista dos rios.
 * STUB da Fase 0. Endpoint: https://flood-api.open-meteo.com/v1/flood
 * (daily=river_discharge,river_discharge_mean,river_discharge_max).
 * Atribuição: Open-Meteo.com / Copernicus GloFAS (CC BY 4.0).
 */
export const URL_OPEN_METEO_FLOOD = "https://flood-api.open-meteo.com/v1/flood";

export interface VazaoPrevistaDia {
  /** "AAAA-MM-DD". */
  data: string;
  vazaoM3s: number | null;
  vazaoMediaM3s: number | null;
  vazaoMaximaM3s: number | null;
}

export interface PrevisaoVazao {
  local: string;
  latitude: number;
  longitude: number;
  dias: VazaoPrevistaDia[];
}

export async function obterVazaoPrevista(): Promise<Leitura<PrevisaoVazao[]>> {
  return naoImplementada("open-meteo-flood");
}
