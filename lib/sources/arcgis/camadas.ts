import type { CamadaMapaId } from "@/lib/dominio/tipos";
import type { FonteId } from "@/lib/fontes/tipos";

/**
 * Catálogo das camadas ArcGIS lidas pela Sala de Situação (somente leitura).
 *
 * `campos` lista, para cada atributo lógico, os candidatos de nome/alias de
 * campo em ordem de preferência (ver campos.ts). Os nomes reais dos
 * formulários Survey123 ainda não foram conferidos contra o servidor: a
 * página /status mostra qual campo foi resolvido para cada atributo — ajuste
 * as listas abaixo se algum atributo aparecer como "não encontrado".
 */

const NUMERO_CHAMADA = [
  "numero_chamada",
  "num_chamada",
  "n_chamada",
  "nr_chamada",
  "no_chamada",
  "numero_da_chamada",
  "chamada_cad",
  "numero_cad",
  "n_cad",
  "chamada",
  "chamada_*",
  "cad",
  "Nº da chamada",
  "Número da chamada",
  "Nº da chamada CAD",
] as const;

const COB = ["cob", "cob_*", "comando_operacional", "comando", "COB"] as const;

const UEOP = [
  "ueop",
  "ueop_*",
  "unidade_operacional",
  "unidade",
  "unidade_*",
  "bbm",
  "batalhao",
  "UEOp",
  "Unidade",
] as const;

const FRACAO = [
  "fracao",
  "fracao_*",
  "fracao_bm",
  "subunidade",
  "companhia",
  "cia",
  "pelotao",
  "pel",
  "posto",
  "Fração",
] as const;

const MUNICIPIO = ["municipio", "municipio_*", "nome_municipio", "cidade", "Município"] as const;

export const CANDIDATOS_ALERTA = {
  numeroChamada: NUMERO_CHAMADA,
  cob: COB,
  ueop: UEOP,
  fracao: FRACAO,
  municipio: MUNICIPIO,
  tipoRisco: [
    "tipo_risco",
    "tipo_de_risco",
    "tipo_do_risco",
    "risco",
    "riscos",
    "tipo_alerta",
    "tipo_de_alerta",
    "tipo",
    "Tipo de risco",
  ],
  nivel: ["nivel_alerta", "nivel_de_alerta", "nivel_risco", "nivel", "grau_risco", "grau", "severidade", "Nível"],
  cota: ["cota", "cota_*", "cota_rio", "nivel_rio", "leitura_cota", "Cota"],
  emitidoEm: [
    "data_emissao",
    "data_hora_emissao",
    "data_alerta",
    "data_hora_alerta",
    "data_hora",
    "data",
    "dt_emissao",
    "Data de emissão",
    "CreationDate",
    "created_date",
  ],
} as const;

export const CANDIDATOS_ACAO_RRD = {
  numeroChamada: NUMERO_CHAMADA,
  cob: COB,
  ueop: UEOP,
  fracao: FRACAO,
  municipio: MUNICIPIO,
  descricao: [
    "acao_executada",
    "acoes_executadas",
    "acao_realizada",
    "acoes_realizadas",
    "descricao_acao",
    "descricao_da_acao",
    "acao",
    "acoes",
    "descricao",
    "Ação executada",
    "Ações realizadas",
  ],
  executadaEm: [
    "data_acao",
    "data_da_acao",
    "data_execucao",
    "data_hora_acao",
    "data_hora",
    "data",
    "Data da ação",
    "CreationDate",
    "created_date",
  ],
} as const;

export const CANDIDATOS_OCORRENCIA = {
  numeroChamada: NUMERO_CHAMADA,
  titulo: [
    "nome_ocorrencia",
    "nome_da_ocorrencia",
    "titulo",
    // "nome" sozinho fica de fora: costuma ser o nome do militar responsável (LGPD).
    "natureza",
    "natureza_*",
    "tipo_ocorrencia",
    "ocorrencia",
    "Ocorrência",
  ],
  situacao: ["situacao", "situacao_*", "status", "status_*", "estado", "fase", "Situação"],
  cob: COB,
  ueop: UEOP,
  fracao: FRACAO,
  municipio: MUNICIPIO,
  iniciadaEm: [
    "data_inicio",
    "data_hora_inicio",
    "inicio",
    "data_ocorrencia",
    "data_da_ocorrencia",
    "data_hora",
    "data",
    "Data de início",
    "CreationDate",
    "created_date",
  ],
} as const;

export const CANDIDATOS_COB = {
  cob: ["cob", "nome_cob", "cob_*", "comando", "nome", "rotulo", "label", "COB"],
} as const;

export type CamadaArcgisId = CamadaMapaId;

export interface DefinicaoCamadaArcgis {
  id: CamadaArcgisId;
  fonte: FonteId;
  nome: string;
  servico: string;
  camada: number;
  geometria: "ponto" | "poligono";
}

export const CAMADAS_ARCGIS: Record<CamadaArcgisId, DefinicaoCamadaArcgis> = {
  cobs: {
    id: "cobs",
    fonte: "arcgis-cobs",
    nome: "Limites dos COBs",
    servico: "MG_DISSOLVIDO_COB",
    camada: 0,
    geometria: "poligono",
  },
  alertas: {
    id: "alertas",
    fonte: "arcgis-alertas",
    nome: "Emissão de Alertas",
    servico: "service_6f690a1b09bf4bab9d6b831de9fc3767_form",
    camada: 1,
    geometria: "ponto",
  },
  "acoes-rrd": {
    id: "acoes-rrd",
    fonte: "arcgis-acoes-rrd",
    nome: "Ações RRD",
    servico: "service_84097bf8336f4667bba0441c1571cd94_form",
    camada: 0,
    geometria: "ponto",
  },
  "ocorrencias-complexas": {
    id: "ocorrencias-complexas",
    fonte: "arcgis-ocorrencias-complexas",
    nome: "Ocorrências Complexas",
    servico: "service_f0ff0b0661d941a0aac4db84ba95f566_form",
    camada: 0,
    geometria: "ponto",
  },
};
