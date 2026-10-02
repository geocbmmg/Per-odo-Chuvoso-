import type { CamadasServicoEsri, CampoEsri, FeicaoEsri } from "@/lib/sources/arcgis/cliente";
import type { CamadaArcgisId } from "@/lib/sources/arcgis/camadas";
import acoesRrd from "./arcgis/acoes-rrd.json";
import alertas from "./arcgis/alertas.json";
import cobs from "./arcgis/cobs.json";
import ocorrencias from "./arcgis/ocorrencias-complexas.json";
import { deslocamentoAte } from "./deslocar";

/**
 * Dados de EXEMPLO das camadas ArcGIS (modo DADOS_EXEMPLO=1 e testes).
 *
 * Estão no formato bruto do ArcGIS REST — `FeatureServer/layers?f=json` com
 * os domínios do Survey123 e a resposta de /query de cada camada — e passam
 * pela MESMA escolha de camada e normalização da produção. Alertas e Ações RRD
 * seguem o esquema dos XLSForms reais (campos, códigos de COB, fração e
 * município; ações RRD na tabela de repetição). Incluem de propósito campos
 * pessoais (nome do militar, nº, posto) para provar que a normalização os
 * descarta. Municípios e frações reais; registros, nomes e números de chamada
 * fictícios. Os limites dos COBs são aproximados (derivados do mapa do
 * GeoRescue e da malha municipal do IBGE).
 */

/** Instante de referência dos arquivos (02/10/2026 12:00 em Brasília). */
export const REFERENCIA_ARCGIS_EXEMPLO = "2026-10-02T15:00:00.000Z";

interface ArquivoExemplo {
  servico: unknown;
  /** Feições por índice de camada/tabela. */
  consultas: Record<string, { features: unknown[] }>;
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

/**
 * Serviço de exemplo: metadados de todas as camadas/tabelas e, por índice,
 * as feições com as datas deslocadas para perto de `agora`.
 */
export function exemploServicoArcgis(
  id: CamadaArcgisId,
  agora: Date = new Date(),
): { servico: CamadasServicoEsri; feicoes: (camada: number) => FeicaoEsri[] } {
  const arquivo = ARQUIVOS[id];
  const servico = arquivo.servico as CamadasServicoEsri;
  const delta = deslocamentoAte(REFERENCIA_ARCGIS_EXEMPLO, agora);
  return {
    servico,
    feicoes(camada) {
      const metadados = [...servico.layers, ...servico.tables].find((c) => c.id === camada);
      const consulta = arquivo.consultas[String(camada)];
      if (!metadados || !consulta) return [];
      return deslocarDatas(metadados.fields, consulta.features as FeicaoEsri[], delta);
    },
  };
}
