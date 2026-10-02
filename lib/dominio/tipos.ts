import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

/**
 * Tipos de domínio da Sala de Situação, já normalizados a partir das fontes.
 * Nenhum tipo aqui carrega dado pessoal (nome de militar, nº BM, telefone):
 * a normalização descarta esses campos antes de qualquer resposta pública (LGPD).
 * Datas sempre em ISO 8601 (UTC); a UI formata em America/Sao_Paulo.
 */

/** Rótulo canônico de COB ("1º COB" … "6º COB") ou o balde "Sem COB". */
export type RotuloCob = string;
export const SEM_COB = "Sem COB";

/** Camadas do mapa expostas por /api/arcgis/[camada]. */
export const CAMADAS_MAPA = ["cobs", "alertas", "acoes-rrd", "ocorrencias-complexas"] as const;
export type CamadaMapaId = (typeof CAMADAS_MAPA)[number];

export interface Alerta {
  id: string;
  /** Nº da chamada CAD — chave que liga alerta → ação RRD → ocorrência. */
  numeroChamada: string | null;
  cob: RotuloCob | null;
  ueop: string | null;
  /** Fração (Cia/Pel/posto) — nível entre a UEOp e o município. */
  fracao: string | null;
  municipio: string | null;
  /** Tipo de risco do formulário: Meteorológico (chuva), Hidrológico (inundação) ou Geológico. */
  tipoRisco: string | null;
  /** Nível do alerta conforme o tipo (campo nivel, inundacao ou deslizamento do formulário). */
  nivel: string | null;
  /** Meteorológico: chuva em mm/h e acumulado em 24 h informados na emissão. */
  chuvaMmHora: number | null;
  chuva24hMm: number | null;
  /** Hidrológico: bacia, rio e cota (cm). */
  bacia: string | null;
  rio: string | null;
  cota: number | null;
  /** Geológico: índice de risco do GeoRisk/CEMADEN. */
  indiceRisco: number | null;
  emitidoEm: string | null;
  /** Data/hora da validade do alerta. */
  validoAte: string | null;
}

export interface AcaoRrd {
  id: string;
  numeroChamada: string | null;
  cob: RotuloCob | null;
  ueop: string | null;
  /** Fração (Cia/Pel/posto) — nível entre a UEOp e o município. */
  fracao: string | null;
  municipio: string | null;
  /** Ações executadas, juntas em um texto (para balões e listas). */
  descricao: string | null;
  /** Uma entrada por ação da repetição "Ações" do formulário. */
  acoes: string[];
  /** Nº REDS informados nas ações (registro da ocorrência; não é dado pessoal). */
  reds: string[];
  executadaEm: string | null;
}

export type SituacaoOcorrencia = "em-andamento" | "monitoramento" | "finalizada" | "desconhecida";

export interface OcorrenciaComplexa {
  id: string;
  numeroChamada: string | null;
  titulo: string | null;
  situacao: SituacaoOcorrencia;
  cob: RotuloCob | null;
  ueop: string | null;
  /** Fração (Cia/Pel/posto) — nível entre a UEOp e o município. */
  fracao: string | null;
  municipio: string | null;
  iniciadaEm: string | null;
}

export interface LimiteCob {
  cob: RotuloCob;
}

export type FeicoesAlertas = FeatureCollection<Point | null, Alerta>;
export type FeicoesAcoesRrd = FeatureCollection<Point | null, AcaoRrd>;
export type FeicoesOcorrencias = FeatureCollection<Point | null, OcorrenciaComplexa>;
export type FeicoesCobs = FeatureCollection<Polygon | MultiPolygon, LimiteCob>;

export interface ContagemPorCob {
  cob: RotuloCob;
  alertas: number;
  acoesRrd: number;
  pendentes: number;
}

export interface Periodo {
  id: "atual" | "anterior" | "tudo";
  rotulo: string;
  /** ISO do início (inclusivo) ou null para "tudo". */
  inicio: string | null;
  /** ISO do fim (exclusivo) ou null para "em aberto". */
  fim: string | null;
}

export interface Indicadores {
  periodo: Periodo;
  totalAlertas: number;
  totalAcoesRrd: number;
  /** Alertas sem nenhuma ação RRD com o mesmo nº de chamada CAD. */
  alertasPendentes: number;
  /** Alertas sem nº de chamada (não dá para vincular a ações RRD). */
  alertasSemNumeroChamada: number;
  porCob: ContagemPorCob[];
  porTipoRisco: { tipo: string; total: number }[];
  ocorrenciasComplexas: Record<SituacaoOcorrencia, number> | null;
}

export type SeveridadeInmet = "perigo-potencial" | "perigo" | "grande-perigo" | "desconhecida";

export interface AvisoInmet {
  id: string;
  evento: string;
  severidade: SeveridadeInmet;
  /** Texto original da severidade no feed. */
  severidadeRotulo: string;
  inicio: string | null;
  fim: string | null;
  descricao: string | null;
  /** Áreas afetadas como vieram do feed (mesorregiões/municípios/UFs). */
  areas: string[];
  link: string | null;
  publicadoEm: string | null;
}

export interface PrevisaoDia {
  /** "AAAA-MM-DD" no horário de Brasília. */
  data: string;
  precipitacaoMm: number | null;
  probabilidadeMax: number | null;
}

export interface PrevisaoHora {
  /** ISO com offset de Brasília. */
  hora: string;
  precipitacaoMm: number | null;
  probabilidade: number | null;
}

export interface PrevisaoLocal {
  /** Identificação do ponto (ex.: "1º COB — Belo Horizonte"). */
  local: string;
  cob: RotuloCob | null;
  municipio: string;
  latitude: number;
  longitude: number;
  acumulado24hMm: number | null;
  acumulado72hMm: number | null;
  diaria: PrevisaoDia[];
  horaria: PrevisaoHora[];
}
