import type {
  FeicoesAcoesRrd,
  FeicoesAlertas,
  FeicoesCobs,
  FeicoesOcorrencias,
} from "@/lib/dominio/tipos";
import {
  CAMADAS_ARCGIS,
  CANDIDATOS_ACAO_RRD,
  CANDIDATOS_ACAO_RRD_REPETICAO,
  CANDIDATOS_ALERTA,
  CANDIDATOS_COB,
  CANDIDATOS_OCORRENCIA,
  type CamadaArcgisId,
} from "./camadas";
import type { CamadasServicoEsri, FeicaoEsri, MetadadosCamadaEsri } from "./cliente";
import { encontrarRepeticao, escolherCamada } from "./deteccao";
import {
  normalizarAcoesRrd,
  normalizarAlertas,
  normalizarCobs,
  normalizarOcorrencias,
  type Diagnostico,
  type Repeticao,
} from "./normalizar";

/**
 * Plano de leitura de uma camada: a partir dos metadados do serviço, escolhe a
 * camada do formulário e a tabela de repetição; depois normaliza as feições
 * consultadas. Puro (sem rede): usado pela produção, pelo modo exemplo e pelos
 * testes.
 */

export interface FeicoesPorCamada {
  cobs: FeicoesCobs;
  alertas: FeicoesAlertas;
  "acoes-rrd": FeicoesAcoesRrd;
  "ocorrencias-complexas": FeicoesOcorrencias;
}

/** Qual camada (ou tabela) do serviço foi lida, para conferência em /status. */
export interface OrigemCamada {
  id: number;
  nome: string;
  tipo: "camada" | "tabela";
  /** Índice configurado em camadas.ts. */
  configurada: number;
  /** Atributos-chave do formulário encontrados nesta camada / total. */
  pontuacao: number;
  total: number;
  repeticao: { id: number; nome: string } | null;
}

export interface DadosCamada<K extends CamadaArcgisId> {
  feicoes: FeicoesPorCamada[K];
  diagnostico: Diagnostico;
  /** Nome da camada como o servidor informa (para conferência em /status). */
  nomeNoServidor: string | null;
  origem: OrigemCamada;
}

const CANDIDATOS: Record<CamadaArcgisId, Record<string, readonly string[]>> = {
  cobs: CANDIDATOS_COB,
  alertas: CANDIDATOS_ALERTA,
  "acoes-rrd": CANDIDATOS_ACAO_RRD,
  "ocorrencias-complexas": CANDIDATOS_OCORRENCIA,
};

export interface Plano {
  principal: MetadadosCamadaEsri;
  repeticao: { metadados: MetadadosCamadaEsri; campoPai: Repeticao["campoPai"] } | null;
  origem: OrigemCamada;
}

/** Escolhe, nos metadados do serviço, a camada do formulário e a tabela de repetição. */
export function planejarLeitura(id: CamadaArcgisId, servico: CamadasServicoEsri): Plano {
  const definicao = CAMADAS_ARCGIS[id];
  const repeticao = definicao.repeticao
    ? encontrarRepeticao(servico, {
        principal: definicao.camada,
        candidatos: CANDIDATOS_ACAO_RRD_REPETICAO,
        conteudo: "descricao",
      })
    : null;
  const escolhida = escolherCamada(servico, {
    preferida: definicao.camada,
    candidatos: CANDIDATOS[id],
    chaves: definicao.chaves,
    excluir: repeticao ? [repeticao.metadados.id] : [],
  });
  if (!escolhida) throw new Error(`${definicao.nome}: o serviço não tem camadas nem tabelas`);
  return {
    principal: escolhida.metadados,
    repeticao,
    origem: {
      id: escolhida.metadados.id,
      nome: escolhida.metadados.name,
      tipo: escolhida.tipo,
      configurada: definicao.camada,
      pontuacao: escolhida.pontuacao,
      total: escolhida.total,
      repeticao: repeticao ? { id: repeticao.metadados.id, nome: repeticao.metadados.name } : null,
    },
  };
}

/** Normaliza as feições lidas conforme o plano (mesmo caminho na produção e no exemplo). */
export function normalizarCamada<K extends CamadaArcgisId>(
  id: K,
  plano: Plano,
  feicoes: FeicaoEsri[],
  filhos: FeicaoEsri[],
): DadosCamada<K> {
  const campos = plano.principal.fields;
  const repeticao = plano.repeticao
    ? { campos: plano.repeticao.metadados.fields, feicoes: filhos, campoPai: plano.repeticao.campoPai }
    : undefined;
  let resultado: { feicoes: unknown; diagnostico: Diagnostico };
  switch (id) {
    case "cobs":
      resultado = normalizarCobs(campos, feicoes);
      break;
    case "alertas":
      resultado = normalizarAlertas(campos, feicoes);
      break;
    case "acoes-rrd":
      resultado = normalizarAcoesRrd(campos, feicoes, repeticao);
      break;
    case "ocorrencias-complexas":
      resultado = normalizarOcorrencias(campos, feicoes);
      break;
    default:
      throw new Error(`Camada desconhecida: ${String(id)}`);
  }
  return {
    feicoes: resultado.feicoes as FeicoesPorCamada[K],
    diagnostico: resultado.diagnostico,
    nomeNoServidor: plano.principal.name ?? null,
    origem: plano.origem,
  };
}
