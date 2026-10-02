/**
 * Contratos compartilhados por todas as fontes de dados.
 * Toda leitura externa chega à UI embrulhada em `Leitura<T>`, com carimbo de
 * atualização e a origem do dado (ao vivo, cache, última leitura válida ou exemplo).
 */

export type FonteId =
  | "arcgis-cobs"
  | "arcgis-alertas"
  | "arcgis-acoes-rrd"
  | "arcgis-ocorrencias-complexas"
  | "arcgis-cotas-sace"
  | "arcgis-nac"
  | "inmet-avisos"
  | "inmet-municipios"
  | "cemaden-alertas"
  | "open-meteo-previsao"
  | "open-meteo-municipios"
  | "ana-telemetria"
  | "open-meteo-flood"
  | "rainviewer-radar";

/**
 * - `ao-vivo`: acabou de ser lido da fonte.
 * - `cache`: lido da fonte há menos de `ttlSegundos` (não consultou de novo).
 * - `ultima-valida`: a fonte falhou agora; exibindo a última leitura bem-sucedida.
 * - `exemplo`: modo DADOS_EXEMPLO=1 — dados fictícios para desenvolvimento/demonstração.
 */
export type OrigemLeitura = "ao-vivo" | "cache" | "ultima-valida" | "exemplo";

export interface Leitura<T> {
  fonte: FonteId;
  dados: T;
  /** Instante (ISO 8601, UTC) em que os dados foram obtidos com sucesso da fonte. */
  atualizadoEm: string;
  origem: OrigemLeitura;
  /** Mensagem do erro mais recente, quando origem = "ultima-valida". */
  erro?: string;
}

/**
 * - `ok`: última tentativa bem-sucedida e leitura dentro da tolerância.
 * - `atrasada`: há leitura válida, mas a fonte falhou na última tentativa
 *   ou a leitura passou da tolerância — a UI exibe a última leitura válida.
 * - `fora-do-ar`: nenhuma leitura válida disponível (ou velha demais).
 * - `nao-implementada`: cliente ainda é stub (fases seguintes).
 * - `exemplo`: aplicação em modo de dados de exemplo.
 * - `desconhecida`: ainda não houve tentativa nesta instância.
 */
export type EstadoFonte =
  | "ok"
  | "atrasada"
  | "fora-do-ar"
  | "nao-implementada"
  | "exemplo"
  | "desconhecida";

export type GrupoFonte = "ArcGIS CBMMG" | "Meteorologia" | "Risco geo-hidrológico" | "Hidrologia";

export interface DefinicaoFonte {
  id: FonteId;
  nome: string;
  descricao: string;
  grupo: GrupoFonte;
  /** Link público de referência (documentação ou serviço). */
  referencia: string;
  /** Tempo em que uma leitura é reaproveitada sem consultar a fonte de novo. */
  ttlSegundos: number;
  /** Idade máxima de uma leitura para a fonte ainda ser considerada "ok". */
  toleranciaSegundos: number;
  /** Acima desta idade, mesmo com leitura válida, a fonte é "fora do ar". */
  limiteForaDoArSegundos: number;
  implementada: boolean;
  /** Crédito/atribuição exibido na UI (termos de uso da fonte). */
  credito: string;
}

export interface StatusFonte {
  definicao: DefinicaoFonte;
  estado: EstadoFonte;
  /** ISO da leitura válida mais recente (se houver). */
  atualizadoEm: string | null;
  /** ISO da última tentativa de consulta à fonte. */
  ultimaTentativaEm: string | null;
  ultimoSucessoEm: string | null;
  ultimoErro: string | null;
  /** Duração (ms) da última tentativa. */
  latenciaMs: number | null;
}

export class FonteIndisponivelError extends Error {
  constructor(
    public readonly fonte: FonteId,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "FonteIndisponivelError";
  }
}
