import "server-only";
import { combinarMetas, metaDaLeitura, type MetaLeitura } from "@/lib/api/respostas";
import { periodoChuvoso, type PeriodoId } from "@/lib/dominio/periodo";
import type { Indicadores, OcorrenciaComplexa } from "@/lib/dominio/tipos";
import { obterCamada } from "@/lib/sources/arcgis";
import { calcularIndicadores } from "./indicadores";

export interface IndicadoresComMeta {
  indicadores: Indicadores;
  /** Carimbo combinado (leitura mais antiga, pior origem). */
  meta: Pick<MetaLeitura, "atualizadoEm" | "origem"> & { erro?: string };
  /** Carimbo de cada fonte usada. */
  fontes: MetaLeitura[];
}

/**
 * Indicadores da Visão Geral a partir das camadas de alertas, ações RRD e
 * ocorrências complexas. Alertas e ações são obrigatórios (sem eles não há
 * como calcular pendências): se um deles estiver sem nenhuma leitura válida,
 * a função lança FonteIndisponivelError. Ocorrências complexas são opcionais.
 */
export async function obterIndicadores(periodoId: PeriodoId, agora: Date = new Date()): Promise<IndicadoresComMeta> {
  const [alertas, acoes, ocorrencias] = await Promise.all([
    obterCamada("alertas"),
    obterCamada("acoes-rrd"),
    obterCamada("ocorrencias-complexas").catch(() => null),
  ]);

  const listaOcorrencias: OcorrenciaComplexa[] | null = ocorrencias
    ? ocorrencias.dados.feicoes.features.map((f) => f.properties)
    : null;

  const indicadores = calcularIndicadores(
    periodoChuvoso(periodoId, agora),
    alertas.dados.feicoes.features.map((f) => f.properties),
    acoes.dados.feicoes.features.map((f) => f.properties),
    listaOcorrencias,
  );

  const fontes = [alertas, acoes, ...(ocorrencias ? [ocorrencias] : [])].map(metaDaLeitura);
  return { indicadores, meta: combinarMetas(fontes), fontes };
}
