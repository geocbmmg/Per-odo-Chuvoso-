import { CORES_NIVEL } from "@/lib/dominio/matrizes";
import type { Alerta } from "@/lib/dominio/tipos";
import { rotuloDe, TIPOS_RISCO_SALA } from "./codigos";
import { SITUACOES_PENDENTES, type AlertaSala } from "./dominio";

/**
 * Alertas da Sala → tipo de domínio `Alerta`, para a camada "Alertas do CBMMG"
 * do mapa de risco (lib/dados/risco.ts), que junta Sala e Survey123 e
 * deduplica pelo nº da chamada (docs/fase-1.md §4.6). Puro.
 *
 * Entram só os alertas PENDENTES (emitido, ciente, em ação) e REAIS (exercício
 * e teste ficam fora do mapa e dos indicadores). A vigência (válido até) é
 * conferida pela própria camada. O tipo de risco usa o mesmo rótulo do
 * formulário ("Meteorológico"), para a deduplicação casar com o legado.
 */
export function alertasDaSalaParaMapa(alertas: readonly AlertaSala[]): Alerta[] {
  return alertas
    .filter((a) => SITUACOES_PENDENTES.includes(a.situacao) && a.natureza === "REAL" && a.nivelAlerta !== null)
    .map((a) => ({
      id: a.alertaId,
      numeroChamada: a.numeroChamada,
      cob: a.cob,
      ueop: a.ueop,
      fracao: a.fracao,
      municipio: a.municipio,
      tipoRisco: rotuloDe(TIPOS_RISCO_SALA, a.tipoRisco),
      nivel: a.nivelAlerta ? CORES_NIVEL[a.nivelAlerta].nome : null,
      nivelRisco: a.nivelAlerta,
      chuvaMmHora: a.mmHora,
      chuva24hMm: a.mm24h,
      bacia: a.bacia,
      rio: a.rio,
      cota: a.cota,
      indiceRisco: a.indiceRisco,
      emitidoEm: a.dataEmissao,
      validoAte: a.validoAte,
    }));
}
