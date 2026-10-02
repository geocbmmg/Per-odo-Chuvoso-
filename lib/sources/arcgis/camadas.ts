import type { CamadaMapaId } from "@/lib/dominio/tipos";
import type { FonteId } from "@/lib/fontes/tipos";

/**
 * Catálogo das camadas ArcGIS lidas pela Sala de Situação (somente leitura).
 *
 * Cada atributo lógico tem os candidatos de nome/alias de campo em ordem de
 * preferência (ver campos.ts). Os primeiros candidatos são os nomes dos
 * XLSForms reais (Emissão de Alertas e Ações RRD, recebidos em 02/10/2026);
 * os demais cobrem variações de outros formulários. A página /status mostra o
 * campo resolvido para cada atributo e a camada escolhida no serviço.
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
  // O formulário grava o nível em um campo por tipo de risco: nivel (meteorológico),
  // inundacao (hidrológico) e deslizamento (geológico). Vale o primeiro preenchido.
  nivel: ["nivel_alerta", "nivel_de_alerta", "nivel_risco", "nivel", "grau_risco", "grau", "severidade", "Nível"],
  nivelHidrologico: ["inundacao", "nivel_inundacao", "inund", "Nível da Cota de Inundação"],
  nivelGeologico: ["deslizamento", "desliz", "Risco de Deslizamento de Terra"],
  chuvaMmHora: ["mmh", "milimetros", "mm_hora", "Milímetros por hora"],
  chuva24hMm: ["mmpor", "mmporhora", "mm_24h", "Milímetros acumulados em 24 horas"],
  bacia: ["bacia", "bac", "Indique a Bacia"],
  rio: ["rio", "nome_rio", "Nome do Rio"],
  cota: ["cota", "cot", "cota_*", "cota_rio", "nivel_rio", "leitura_cota", "Cota"],
  indiceRisco: ["indice", "ind", "indice_risco", "Insira o índice de Risco"],
  validoAte: ["validade", "data_validade", "valido_ate", "Data/Hora da Validade do Alerta"],
  emitidoEm: [
    "datain",
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
    "datain",
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

/**
 * Repetição "Ações" do formulário de Ações RRD (tabela filha, ligada ao
 * registro principal por parentglobalid): uma linha por ação executada.
 */
export const CANDIDATOS_ACAO_RRD_REPETICAO = {
  descricao: CANDIDATOS_ACAO_RRD.descricao,
  reds: ["reds", "n_reds", "numero_reds", "nr_reds", "N. Reds", "Nº REDS"],
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
    "datain",
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
  /**
   * Índice preferido no FeatureServer. Se outra camada ou tabela do serviço
   * resolver mais `chaves`, ela é usada no lugar (deteccao.ts) e /status avisa.
   */
  camada: number;
  /** Atributos lógicos que identificam a camada do formulário. */
  chaves: readonly string[];
  geometria: "ponto" | "poligono";
  /** Lê também a tabela de repetição do formulário (ações da RRD). */
  repeticao?: boolean;
}

export const CAMADAS_ARCGIS: Record<CamadaArcgisId, DefinicaoCamadaArcgis> = {
  cobs: {
    id: "cobs",
    fonte: "arcgis-cobs",
    nome: "Limites dos COBs",
    servico: "MG_DISSOLVIDO_COB",
    camada: 0,
    chaves: ["cob"],
    geometria: "poligono",
  },
  alertas: {
    id: "alertas",
    fonte: "arcgis-alertas",
    nome: "Emissão de Alertas",
    servico: "service_6f690a1b09bf4bab9d6b831de9fc3767_form",
    // Camada 1 por indicação da equipe; o pulldata do formulário de Ações RRD
    // consulta a camada 0. A detecção escolhe a que tiver os campos do formulário.
    camada: 1,
    chaves: ["numeroChamada", "cob", "ueop", "municipio", "tipoRisco", "nivel", "nivelHidrologico", "nivelGeologico"],
    geometria: "ponto",
  },
  "acoes-rrd": {
    id: "acoes-rrd",
    fonte: "arcgis-acoes-rrd",
    nome: "Ações RRD",
    servico: "service_84097bf8336f4667bba0441c1571cd94_form",
    camada: 0,
    chaves: ["numeroChamada", "cob", "ueop", "municipio"],
    geometria: "ponto",
    repeticao: true,
  },
  "ocorrencias-complexas": {
    id: "ocorrencias-complexas",
    fonte: "arcgis-ocorrencias-complexas",
    nome: "Ocorrências Complexas",
    servico: "service_f0ff0b0661d941a0aac4db84ba95f566_form",
    camada: 0,
    chaves: ["numeroChamada", "titulo", "situacao", "cob", "ueop", "municipio"],
    geometria: "ponto",
  },
};
