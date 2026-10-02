import "server-only";
import type {
  FeicoesAcoesRrd,
  FeicoesAlertas,
  FeicoesCobs,
  FeicoesOcorrencias,
} from "@/lib/dominio/tipos";
import { env, modoExemplo } from "@/lib/env";
import { obterLeitura } from "@/lib/fontes/leituras";
import type { Leitura } from "@/lib/fontes/tipos";
import { exemploBrutoArcgis } from "@/lib/sources/exemplos/arcgis";
import { CAMADAS_ARCGIS, type CamadaArcgisId } from "./camadas";
import {
  consultarTodas,
  lerMetadadosCamada,
  montarUrlCamada,
  type CampoEsri,
  type FeicaoEsri,
} from "./cliente";
import {
  normalizarAcoesRrd,
  normalizarAlertas,
  normalizarCobs,
  normalizarOcorrencias,
  type Diagnostico,
} from "./normalizar";

export type { CamadaArcgisId } from "./camadas";
export { CAMADAS_ARCGIS } from "./camadas";

export interface FeicoesPorCamada {
  cobs: FeicoesCobs;
  alertas: FeicoesAlertas;
  "acoes-rrd": FeicoesAcoesRrd;
  "ocorrencias-complexas": FeicoesOcorrencias;
}

export interface DadosCamada<K extends CamadaArcgisId> {
  feicoes: FeicoesPorCamada[K];
  diagnostico: Diagnostico;
  /** Nome da camada como o servidor informa (para conferência em /status). */
  nomeNoServidor: string | null;
}

function normalizar<K extends CamadaArcgisId>(
  id: K,
  campos: CampoEsri[],
  feicoes: FeicaoEsri[],
): { feicoes: FeicoesPorCamada[K]; diagnostico: Diagnostico } {
  switch (id) {
    case "cobs":
      return normalizarCobs(campos, feicoes) as { feicoes: FeicoesPorCamada[K]; diagnostico: Diagnostico };
    case "alertas":
      return normalizarAlertas(campos, feicoes) as { feicoes: FeicoesPorCamada[K]; diagnostico: Diagnostico };
    case "acoes-rrd":
      return normalizarAcoesRrd(campos, feicoes) as { feicoes: FeicoesPorCamada[K]; diagnostico: Diagnostico };
    case "ocorrencias-complexas":
      return normalizarOcorrencias(campos, feicoes) as { feicoes: FeicoesPorCamada[K]; diagnostico: Diagnostico };
    default:
      throw new Error(`Camada desconhecida: ${String(id)}`);
  }
}

async function carregar<K extends CamadaArcgisId>(id: K): Promise<DadosCamada<K>> {
  const definicao = CAMADAS_ARCGIS[id];
  const { ARCGIS_SERVICES_URL, FONTES_TIMEOUT_MS } = env();
  const url = montarUrlCamada(ARCGIS_SERVICES_URL, definicao.servico, definicao.camada);

  // Metadados trazem os domínios (rótulos das escolhas do Survey123), que a query não traz.
  const metadados = await lerMetadadosCamada(url, { timeoutMs: FONTES_TIMEOUT_MS });
  const simplificar = definicao.geometria === "poligono"
    ? { maxAllowableOffset: 0.002, geometryPrecision: 5 }
    : {};
  const consulta = await consultarTodas(
    url,
    { where: "1=1", outFields: "*", returnGeometry: true, ...simplificar },
    {
      timeoutMs: FONTES_TIMEOUT_MS,
      tamanhoPagina: Math.min(Math.max(metadados.maxRecordCount ?? 1000, 1), 2000),
    },
  );

  const { feicoes, diagnostico } = normalizar(id, metadados.fields, consulta.features);
  return { feicoes, diagnostico, nomeNoServidor: metadados.name ?? null };
}

/**
 * Lê uma camada ArcGIS com cache e fallback para a última leitura válida
 * (ver lib/fontes/leituras.ts). Somente leitura.
 */
export function obterCamada<K extends CamadaArcgisId>(id: K): Promise<Leitura<DadosCamada<K>>> {
  const definicao = CAMADAS_ARCGIS[id];
  return obterLeitura(definicao.fonte, id, () => carregar(id), {
    modoExemplo: modoExemplo(),
    exemplo: () => {
      // Exemplo em formato bruto do ArcGIS, normalizado pelo mesmo caminho da produção.
      const { metadados, feicoes } = exemploBrutoArcgis(id);
      return { ...normalizar(id, metadados.fields, feicoes), nomeNoServidor: metadados.name ?? null };
    },
  });
}
