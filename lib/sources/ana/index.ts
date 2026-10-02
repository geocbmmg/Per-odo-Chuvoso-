import "server-only";
import type { Leitura } from "@/lib/fontes/tipos";
import { naoImplementada } from "@/lib/sources/stub";

/**
 * ANA — HidroWebService (telemetria de rios). STUB da Fase 0.
 *
 * Fase 1: autenticar com ANA_IDENTIFICADOR/ANA_TOKEN (variáveis de ambiente,
 * nunca no front-end), ler a série telemétrica das estações de interesse e
 * comparar com as cotas de atenção/alerta/inundação do SACE. Detalhes do
 * fluxo de autenticação e dos endpoints em docs/fontes-de-dados.md.
 */
export const URL_ANA_HIDROWEBSERVICE = "https://www.ana.gov.br/hidrowebservice/";

export interface LeituraTelemetrica {
  codigoEstacao: string;
  /** ISO 8601 (UTC). */
  dataHora: string;
  nivelCm: number | null;
  vazaoM3s: number | null;
  chuvaMm: number | null;
}

export async function obterTelemetriaAna(codigosEstacao: string[]): Promise<Leitura<LeituraTelemetrica[]>> {
  void codigosEstacao;
  return naoImplementada("ana-telemetria");
}
