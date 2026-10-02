import type { CampoEsri, FeicaoEsri, MetadadosCamadaEsri } from "@/lib/sources/arcgis/cliente";
import type { CamadaArcgisId } from "@/lib/sources/arcgis/camadas";
import acoesRrd from "./arcgis/acoes-rrd.json";
import alertas from "./arcgis/alertas.json";
import cobs from "./arcgis/cobs.json";
import ocorrencias from "./arcgis/ocorrencias-complexas.json";
import { deslocamentoAte } from "./deslocar";

/**
 * Dados de EXEMPLO das camadas ArcGIS (modo DADOS_EXEMPLO=1 e testes).
 *
 * Estão no formato bruto do ArcGIS REST — metadados com domínios do Survey123
 * e resposta de /query — e passam pela MESMA normalização da produção.
 * Incluem de propósito campos pessoais (militar, nº BM, telefone) para provar
 * que a normalização os descarta. Municípios e sedes reais; registros,
 * nomes e números de chamada fictícios. Os limites dos COBs são aproximados
 * (derivados do mapa do GeoRescue e da malha municipal do IBGE).
 */

/** Instante de referência dos arquivos (02/10/2026 12:00 em Brasília). */
export const REFERENCIA_ARCGIS_EXEMPLO = "2026-10-02T15:00:00.000Z";

interface ArquivoExemplo {
  metadados: unknown;
  consulta: { features: unknown[] };
}

const ARQUIVOS: Record<CamadaArcgisId, ArquivoExemplo> = {
  cobs,
  alertas,
  "acoes-rrd": acoesRrd,
  "ocorrencias-complexas": ocorrencias,
};

function deslocarDatas(campos: CampoEsri[], feicoes: FeicaoEsri[], deltaMs: number): FeicaoEsri[] {
  const camposData = campos.filter((c) => c.type === "esriFieldTypeDate").map((c) => c.name);
  return feicoes.map((f) => {
    const attributes = { ...f.attributes };
    for (const nome of camposData) {
      const valor = attributes[nome];
      if (typeof valor === "number") attributes[nome] = valor + deltaMs;
    }
    return { ...f, attributes };
  });
}

/** Lê o arquivo bruto de exemplo (metadados + feições) com as datas deslocadas. */
export function exemploBrutoArcgis(
  id: CamadaArcgisId,
  agora: Date = new Date(),
): { metadados: MetadadosCamadaEsri; feicoes: FeicaoEsri[] } {
  const arquivo = ARQUIVOS[id];
  const metadados = arquivo.metadados as MetadadosCamadaEsri;
  const feicoes = deslocarDatas(
    metadados.fields,
    arquivo.consulta.features as FeicaoEsri[],
    deslocamentoAte(REFERENCIA_ARCGIS_EXEMPLO, agora),
  );
  return { metadados, feicoes };
}
