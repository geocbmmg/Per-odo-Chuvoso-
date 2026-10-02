import "server-only";
import { env } from "@/lib/env";
import { obterLeituraServidor } from "@/lib/fontes/armazem-servidor";
import type { Leitura } from "@/lib/fontes/tipos";
import { exemploServicoArcgis } from "@/lib/sources/exemplos/arcgis";
import { CAMADAS_ARCGIS, type CamadaArcgisId } from "./camadas";
import { consultarTodas, lerCamadasServico, montarUrlServico, type MetadadosCamadaEsri } from "./cliente";
import { normalizarCamada, planejarLeitura, type DadosCamada } from "./plano";

export type { CamadaArcgisId } from "./camadas";
export { CAMADAS_ARCGIS } from "./camadas";
export type { DadosCamada, FeicoesPorCamada, OrigemCamada } from "./plano";

async function carregar<K extends CamadaArcgisId>(id: K): Promise<DadosCamada<K>> {
  const definicao = CAMADAS_ARCGIS[id];
  const { ARCGIS_SERVICES_URL, FONTES_TIMEOUT_MS } = env();
  const urlServico = montarUrlServico(ARCGIS_SERVICES_URL, definicao.servico);

  // Uma chamada traz todas as camadas e tabelas com campos e domínios
  // (rótulos das escolhas do Survey123, que a query não traz).
  const plano = planejarLeitura(id, await lerCamadasServico(urlServico, { timeoutMs: FONTES_TIMEOUT_MS }));
  const consultar = async (metadados: MetadadosCamadaEsri, comGeometria: boolean) =>
    (
      await consultarTodas(
        `${urlServico}/${metadados.id}`,
        {
          where: "1=1",
          outFields: "*",
          returnGeometry: comGeometria,
          ...(definicao.geometria === "poligono" ? { maxAllowableOffset: 0.002, geometryPrecision: 5 } : {}),
        },
        {
          timeoutMs: FONTES_TIMEOUT_MS,
          tamanhoPagina: Math.min(Math.max(metadados.maxRecordCount ?? 1000, 1), 2000),
        },
      )
    ).features;

  const [feicoes, filhos] = await Promise.all([
    consultar(plano.principal, plano.origem.tipo === "camada"),
    plano.repeticao ? consultar(plano.repeticao.metadados, false) : Promise.resolve([]),
  ]);
  return normalizarCamada(id, plano, feicoes, filhos);
}

/**
 * Lê uma camada ArcGIS com cache e fallback para a última leitura válida
 * (ver lib/fontes/leituras.ts). Somente leitura.
 */
export function obterCamada<K extends CamadaArcgisId>(id: K): Promise<Leitura<DadosCamada<K>>> {
  const definicao = CAMADAS_ARCGIS[id];
  return obterLeituraServidor(definicao.fonte, id, () => carregar(id), {
    exemplo: () => {
      // Exemplo em formato bruto do ArcGIS, pelo mesmo caminho da produção:
      // escolha da camada, repetição e normalização.
      const exemplo = exemploServicoArcgis(id);
      const plano = planejarLeitura(id, exemplo.servico);
      return normalizarCamada(
        id,
        plano,
        exemplo.feicoes(plano.principal.id),
        plano.repeticao ? exemplo.feicoes(plano.repeticao.metadados.id) : [],
      );
    },
  });
}
